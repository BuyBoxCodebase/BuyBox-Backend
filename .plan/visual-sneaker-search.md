# Visual Sneaker Search — Implementation Plan

Status: **Planning** (no code written yet)
Last updated: 2026-10-11

## Goal

Let a Treides customer upload a photo of a sneaker and get back the closest matching
products from our catalogue, ranked by visual similarity.

Approach: use a pretrained **OpenCLIP** model to turn every catalogue image into an
embedding (a vector of numbers that captures what the image looks like), store those
vectors in MongoDB Atlas, and at search time embed the customer's photo with the same
model and run an Atlas **Vector Search** to find the nearest products.

---

## Assumptions

These are the assumptions the plan rests on. If any of them is wrong, the affected
steps need revisiting.

1. **Database is MongoDB Atlas.** Confirmed. Atlas Vector Search (`$vectorSearch`)
   is available on our cluster tier.
2. **The backend stays on Vercel.** The NestJS app in this repo is deployed via
   `vercel.json` using `@vercel/node`. We do not want to move it.
3. **Prisma is the data layer.** Prisma has no native vector type or `$vectorSearch`
   support, so embeddings are stored as `Float[]` and searched through
   `prisma.<model>.aggregateRaw(...)`. We already use `aggregateRaw` in
   `src/analytics/activity/journey.service.ts`.
4. **Product images live on Cloudinary** and are referenced by URL in
   `Product.images` and `ProductVariant.images`. The embedding job downloads them
   from those URLs.
5. **Catalogue size is small to medium** (thousands to tens of thousands of images).
   At this scale Atlas Vector Search needs no special tuning, and a full re-embed
   takes minutes to hours, not days.
6. **Model choice for v1:** OpenCLIP `ViT-B-32` (512-dim vectors) as the default,
   because it runs acceptably on CPU. `ViT-L-14` (768-dim) is the upgrade path if
   accuracy is not good enough. The choice is final only after the evaluation in step 5.
7. **The goal for v1 is "visually similar", not guaranteed exact SKU match.** CLIP
   is strong on silhouette, colour and material, but weaker at telling near-identical
   colourways apart. Exact-match accuracy is measured, not promised.
8. **A daily refresh is acceptable for new seller listings in v1**, so a new product
   can take up to ~24 hours to become visually searchable. See step 7 for how to
   tighten this later.
---

## Architecture overview

```
                    ┌──────────────────────────────┐
  Customer app ───► │  Vercel (NestJS backend)     │
  (photo upload)    │  POST /visual-search         │
                    │   1. validate + resize image │
                    │   2. call embedding service ─┼──► Hugging Face Inference Endpoint
                    │   3. $vectorSearch (Atlas)   │    (OpenCLIP, returns vector)
                    │   4. group + filter results  │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    MongoDB Atlas  (ProductImageEmbedding + vector index)
                                   ▲
                                   │
       Embedding script (local for backfill, then scheduled daily)
       reads products → downloads images → calls embedding service → upserts vectors
```

The important split: **Vercel runs the API and the database query; the model itself
runs on Hugging Face.** The reasons are covered in the next section.

---

## Vercel limits and why the model can't run there

Vercel functions are built for lightweight request handlers, not for hosting ML
models. Running OpenCLIP inside our Vercel backend hits several limits.
(Check the exact numbers against Vercel's current docs and our plan tier before
relying on them.)

| Limit | What it means for OpenCLIP |
|---|---|
| **Function bundle size** (~250 MB unzipped) | OpenCLIP needs PyTorch (several hundred MB on its own) plus model weights (~600 MB for ViT-B-32, ~1.7 GB for ViT-L-14). It doesn't fit. Our backend is also Node/NestJS, and OpenCLIP is a Python library. |
| **No GPU** | All inference would run on CPU, so each embedding is slow, especially with larger models. |
| **Cold starts** | Every cold start would load hundreds of MB of weights into memory before handling the request, adding seconds of latency to a customer-facing search. |
| **Memory caps** | Loading the model plus processing images can exceed the function's memory allocation. |
| **Max execution time** | A catalogue backfill (thousands of images) cannot run inside a single function invocation. It would time out. |
| **Request body size** (~4.5 MB) | Raw phone photos can exceed this. The customer app must compress or resize before uploading, or upload to Cloudinary first and send the URL. |
| **No long-running process** | `@nestjs/schedule` cron jobs (as in `src/scheduler/scheduler.service.ts`) only fire while a process is alive. On serverless they are unreliable. Scheduled work must be triggered externally (e.g. Vercel Cron calling an endpoint). |

**Conclusion:** keep everything that is plain API + database work on Vercel, and move
the "image → vector" step to a service built for running models.

---

## How Hugging Face solves this

**Hugging Face Inference Endpoints** host a model on dedicated infrastructure that
Hugging Face manages, exposed as an HTTPS API. Our backend sends an image and gets a
vector back.

- **Model runs where it fits.** The endpoint is a container with PyTorch and the
  OpenCLIP weights preloaded, with no 250 MB bundle limit and no Node/Python mismatch.
- **CPU or GPU, chosen per need.** Start on a small CPU instance with ViT-B-32. Switch
  the instance type to a GPU later (a config change) if latency or the ViT-L-14
  upgrade calls for it.
- **The model stays loaded.** Weights load once when the endpoint starts, not per
  request, so each search costs only the inference time.
- **Scale-to-zero.** The endpoint can sleep when idle to save cost, at the price of a
  cold start on the first request after sleeping. For a customer-facing feature we
  will likely keep at least one replica warm in production. Staging can scale to zero.
- **Custom handler support.** OpenCLIP models are not a standard HF pipeline task, so
  we deploy with a small custom `handler.py` that loads `open_clip`, applies the
  model's preprocessing, and returns an L2-normalised vector. The same handler serves
  both the batch job and live searches, which guarantees identical preprocessing.
- **Security.** The endpoint is protected by an HF access token, stored in Vercel
  env vars (`HF_ENDPOINT_URL`, `HF_API_TOKEN`) and never exposed to the client.
- **Billing is per hour of uptime per instance**, not per request. Cost depends on
  instance type and scale-to-zero settings, so estimate it before production launch.

Alternatives considered (same pattern, different host): Modal, Replicate, or a
container on Railway/Render/Fly. Hugging Face is preferred because OpenCLIP weights
are already published there and endpoint management needs no infra work from us.

---

## Data model

New Prisma model (added to `prisma/schema.prisma`):

```prisma
model ProductImageEmbedding {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  productId    String   @db.ObjectId
  variantId    String?  @db.ObjectId
  imageUrl     String
  embedding    Float[]           // 512 dims for ViT-B-32
  modelVersion String            // e.g. "openclip:ViT-B-32:laion2b_s34b_b79k"
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([imageUrl, modelVersion])
  @@index([productId])
}
```

- **One row per image, not per product.** Every image in `Product.images` and
  `ProductVariant.images` gets its own vector (side, top, sole, and so on). This makes
  matching robust to whatever angle the customer photographs.
- **`modelVersion` on every row**, so we can re-embed with a new model side by side
  and switch over without downtime.
- **Tracking fields on `Product`** (or a small status collection):
  `embeddingStatus` (`PENDING | DONE | FAILED`), `embeddingModelVersion`,
  `embeddedAt`. The daily job uses these instead of a time window (see step 7).

Atlas Vector Search index on `ProductImageEmbedding` (created in the Atlas UI or CLI,
not by Prisma):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 512, "similarity": "cosine" },
    { "type": "filter", "path": "modelVersion" },
    { "type": "filter", "path": "productId" }
  ]
}
```

Fields we want to filter search results on (in stock, category, gender, price) live on
`Product` or `Inventory`, not on the embedding row. Two options:

- **v1 (simpler):** over-fetch from `$vectorSearch` (e.g. top 100 images), then
  `$lookup` the product and filter and group in the same aggregation.
- **Later, if needed:** denormalise key filter fields (`categoryId`, `gender`,
  `inStock`) onto the embedding row and add them as `filter` fields in the index for
  pre-filtering.

---

## Steps

### Step 1: Deploy the embedding service on Hugging Face (staging)

- Create an Inference Endpoint with a custom `handler.py` that:
  - loads OpenCLIP `ViT-B-32` once at startup,
  - accepts either an image URL or raw image bytes,
  - applies the model's own preprocessing transform,
  - returns an L2-normalised embedding and the `modelVersion` string.
- Small CPU instance, scale-to-zero enabled for staging.
- Smoke-test it manually with a couple of catalogue image URLs.

### Step 2: Write the embedding script

Located at `src/scripts/generate-image-embeddings.ts`, following the pattern of the
existing scripts there.

- Read products (and variants) whose `embeddingStatus` is not `DONE` for the current
  `modelVersion`.
- Collect every image URL. Request a reasonable size from Cloudinary (e.g. 512 px)
  via a URL transformation to cut download time.
- Optional but recommended: request a background-removed or trimmed version from
  Cloudinary, so catalogue images and customer photos are closer in style.
- Call the HF endpoint in small concurrent batches, with retries and backoff.
- Upsert into `ProductImageEmbedding`, delete rows for images no longer on the
  product, then mark the product `DONE` (or `FAILED` with the error logged).
- Idempotent: safe to re-run at any time; already-embedded images are skipped.

### Step 3: Backfill the staging database locally

- Run the script from a developer machine against the **staging** Atlas DB.
- Create the vector search index on staging and wait for it to finish building.
- Spot-check: pick a product image, search with it, and confirm the product comes
  back first.

### Step 4: Build the search API (on staging)

New `visual-search` module in the NestJS backend: `POST /visual-search`.

1. Accept an image (multipart, already compressed by the client) or a Cloudinary URL.
2. Validate type and size, and resize if needed.
3. Call the HF endpoint to get the query vector.
4. Run `aggregateRaw` on `ProductImageEmbedding`:
   - `$vectorSearch` (filtered to the current `modelVersion`, `numCandidates` around
     10–20× `limit`),
   - `$group` by `productId`, keeping the best score per product,
   - `$lookup` product + inventory, filter out out-of-stock or inactive products,
   - `$sort` by score and `$limit` to the page size.
5. Return products in the same shape as the existing search results
   (see `src/lino/search/product-result.ts`) so the frontend can reuse its components.
6. Optional minimum-similarity threshold so a photo of a cat returns "no matches"
   instead of the least-bad sneakers.
7. Rate-limit the endpoint (each call costs an inference). Do not store uploaded
   customer photos beyond the request, unless we decide on a retention policy.


### Step 6: Deploy to production

- Create a **production** HF endpoint (keep at least one replica warm) and set
  `HF_ENDPOINT_URL` / `HF_API_TOKEN` in Vercel production env vars.
- Run the embedding script against the **production** DB to backfill.
- Create the vector search index on production and wait for it to build.
- Deploy the backend to Vercel with the `visual-search` module behind a feature flag.


### Step 7: Daily job for new seller products

- Same script, triggered once a day.
- **Uses the `embeddingStatus` flag, not "uploaded in the last 24 hours".** A time
  window misses products when a run fails or is skipped. It also misses sellers who
  edit product images, and leaves stale vectors for deleted images. Status-based
  processing catches all of these.
- When a seller creates or updates a product's images, the product service sets
  `embeddingStatus = PENDING` (hook in `src/product/product.service.ts`).
- **Where it runs:** not inside a single Vercel function (time limits) and not via
  `@nestjs/schedule` (no long-running process on serverless). Options:
  - **Vercel Cron → a protected endpoint** that processes one small batch per call
    and is invoked repeatedly, or
  - **GitHub Actions scheduled workflow** that runs the script directly (simplest,
    no time limit).
- Deleted products: `onDelete: Cascade` doesn't apply across a raw collection
  without a relation, so either add the Prisma relation or delete embeddings in the
  product delete path.
---

## Out of scope for v1

- Fine-tuning OpenCLIP on our catalogue.
- Re-ranking with a second, more precise model.
- Text-to-image search through the same index (cheap to add later, since the
  OpenCLIP text encoder shares the same vector space).
- Detecting multiple shoes in one photo.

