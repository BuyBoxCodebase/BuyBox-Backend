# Plan: One Search Engine for the Navbar and Lino

Status: draft for review · Scope: backend + customer website (the app is out of scope for now)

Constraints agreed:
- Database is MongoDB Atlas.
- Only in-stock products are ever shown.
- Catalog is ~600 products and will stay under 2,000.
- We are free to delete, merge or replace existing search code.
- Goal: noticeably better results **and** noticeably faster responses, in both the navbar and Lino.

---

## 1. Why it's slow and why Lino repeats itself (root causes)

### 1.1 Lino returns the same products

1. **Every failed search collapses to "newest 8".** `SearchRepository` only narrows the database query by brand, category, gender or `productName` (a `contains` match). Everything else — occasion, keywords — only re-ranks. When a query doesn't match, `search-attempts.ts` drops filters one by one until the filter set is empty, which means "the 200 newest in-stock products". Their relevance scores are mostly 0, so ties are broken by `byNewest`. Result: any vague or failed request returns the same newest 8 products.
2. **There is no retrieval by meaning.** "Comfortable shoes for standing all day" contains no brand, category or product name, so the database returns the newest 200 and description keywords nudge the order slightly. Different natural-language requests therefore look nearly identical.
3. **Stale filters are carried forward.** `lastIntent` is replayed into the system prompt *and* the user message on every turn, with instructions to always carry it forward. Brand is never dropped by the fallback, so a brand mentioned once can pin the rest of the conversation.
4. **The website shows the first search, not the last.** The website calls `/lino/chat` (non-streaming). `extractProductsFromMessages` returns the **first** tool result's products. If the model searched, then refined, the customer still sees the first set.
5. **Category values are hardcoded.** The tool's `category` enum (`Sneakers`, `Training`, …) and `CATEGORY_MAP` are hardcoded. If real category/sub-category names in the DB differ, the category filter matches nothing and gets dropped → back to cause 1. *(To verify against the DB.)*

### 1.2 The navbar search is slow

1. **It downloads the entire catalog to search it.** `/search` calls a server action that fetches `/product/get-all-product` — every in-stock product with category, sub-category, all variants, inventory and options — and runs Fuse.js in the browser.
2. **The Next.js fetch cache probably isn't helping.** The fetch asks for 3-hour revalidation, but Next.js's data cache refuses entries over 2 MB. With ~600 products and nested variants/options, that response is likely over the limit, so each search would hit the backend fresh. *(Verify: look for "items over 2MB can not be cached" in the Next server logs, or measure the response size.)*
3. **The backend query is heavy.** Prisma on MongoDB resolves each `include` level with extra queries; four nested levels for 600 products is a lot of work and payload per request.
4. **The search page renders on the client**, so the customer sees a skeleton until the JS loads, the server action runs, the catalog arrives and Fuse finishes.

### 1.3 Lino is slow

1. **The website waits for the whole answer.** `/lino/chat` uses `generateText`: at least two LLM round trips (tool call → summary) before anything is returned. A streaming endpoint exists (`/lino/chat-stream`) but the website doesn't use it.
2. **The prompt is very large.** The system prompt is hundreds of lines, plus 15 history messages, plus the active filters twice, plus the semantic-intent block — on every turn.
3. **Search results are bulky for the model.** Each of 8 products includes up to 100 words of description, which the model must read before replying.

### 1.4 Shared to both

- **Possible cold starts.** The backend runs as a Vercel serverless function (`vercel.json`). A NestJS app plus Prisma connecting to Atlas on cold start can add seconds to the first request after idle. *(Measure before deciding anything here.)*

---

## 2. Target design

### 2.1 Principle

```
                 ┌─────────────── one Search Core (backend) ───────────────┐
navbar ─┐        │                                                          │
        ├─ text ─▶ 1. Parse    → hard filters from catalog vocabulary       │
Lino ───┘        │ 2. Retrieve → Atlas hybrid: keyword (fuzzy) + vector     │
 (tool)          │ 3. Verify   → live stock / size / colour / price per variant
                 │ 4. Rank     → fused score + light boosts                 │
                 │ 5. Relax    → loosen filters only if nothing matched     │
                 └──────────────────────────────────────────────────────────┘
                          │                               │
                  product cards + facets           compact list for the LLM
```

- **One engine, two callers.** The navbar and Lino call the same `SearchCore.search()`. Neither does its own retrieval.
- **No LLM in the navbar path.** Meaning comes from embeddings (one cheap embedding call, cached), not from a chat model. That's what makes it fast. Lino is where generation lives.
- **Meaning is indexed; stock is checked live.** The index stores what a product *is*. Whether size 9 in black is in stock right now is always checked against variants/inventory at query time (the existing `variant-matcher.ts` logic).

### 2.2 The search index (Atlas)

A new collection, `ProductSearchDoc`, one document per product with in-stock variants:

| Field | Purpose |
|---|---|
| `productId` | link back to `Product` |
| `name`, `brand`, `modelName`, `category`, `subCategory` | keyword search (boosted) |
| `description`, attribute text (`use_case`, `materials`) | keyword search (lower weight) |
| `colours[]`, `sizes[]`, `gender`, `minPrice`, `maxPrice` | pre-filters and facets (in-stock variants only) |
| `searchText` | the text that was embedded (name + brand + category + description + attributes) |
| `embedding` | vector of `searchText` |
| `createdAt`, `popularity` (later) | tie-breaks / boosts |

Indexes:
- **Atlas Search index**: `name`/`brand`/`modelName` with `autocomplete` and fuzzy matching (typos), `description` as text, `brand`/`category`/`gender`/`colours`/`sizes`/price as filter + facet fields. A **synonyms** collection for domain words ("trainers ↔ sneakers", "kicks", "joggers", "plantar fasciitis → max cushion"). This replaces the hand-written `biomechanical-dictionary.ts` idea with something the search engine applies itself.
- **Atlas Vector Search index** on `embedding`, with `brand`, `category`, `gender`, `colours`, `sizes`, `minPrice` as filter fields.

Keeping it fresh:
- Rebuild a product's document whenever the product, its variants, options, or inventory change (product service, inventory updates, order placement/cancellation).
- A script that rebuilds everything (2,000 docs; trivial) — run on deploy and nightly as a safety net.
- Embeddings are recomputed only when `searchText` changes (store a hash), so stock changes don't cost an API call.

### 2.3 Query flow in detail

1. **Parse (≈1 ms, no network).**
   - Tokenise; match against the **real** brands, categories, colours and sizes loaded from the DB (cached in memory, refreshed every few minutes). Whole-word matching only — no more "cushioned" → brand `On`.
   - Prices: "under 100", "below $80", "50-100", "between 50 and 100", "over 200".
   - Size: "size 9", "sz 9", "uk 9", "9.5".
   - Gender: "men's", "women", "unisex".
   - What's left over is the **free text** used for retrieval.
2. **Retrieve (target < 100 ms).**
   - Embed the free text (cached in Redis; most navbar queries repeat).
   - `$search` (fuzzy keyword, synonyms, boosts on name/brand) and `$vectorSearch` run in parallel through Mongoose, both pre-filtered by the parsed hard filters, and are merged with Reciprocal Rank Fusion in code. *(Built this way instead of `$rankFusion`: M0 support for it isn't documented, and merging in code lets us drop weak vector hits by score.)*
   - If there's no free text (e.g. "nike size 9"), skip the vector side — pure filter + sort.
3. **Verify.** Load the candidate products' variants and inventory (one query for ≤ ~100 ids) and keep only those with an in-stock variant matching size/colour/price. Reuse `variant-matcher.ts`.
4. **Rank.** Fused rank order, plus small boosts (exact name match, in-stock depth), then requested sort (price, newest) if the customer chose one.
5. **Relax.** Only if zero products survive: drop colour → size → widen price → drop price → gender → category (reuse `search-attempts.ts`). **Never fall back to "everything".** If nothing survives, return an empty result with suggestions (nearest brand/category, "did you mean").
6. **Respond.**
   ```ts
   {
     query, appliedFilters, relaxed: { dropped, widenedPrice } | null,
     products: ProductCard[],     // what the card component needs, nothing more
     facets: { brands, colours, sizes, price },   // counts from Atlas $searchMeta
     page, hasMore, tookMs
   }
   ```
   Lino gets a compact projection of the same products (no long descriptions).

### 2.4 Navbar & results UX

- **Instant suggestions while typing** (debounced ~150 ms): matching brands, categories and up to 5 products with image and price, from the Atlas autocomplete index. Enter goes to the full results page.
- **Server-rendered results page**: `/search` becomes a server component that calls the search endpoint, so results arrive with the HTML. Filters live in the URL (`/search?q=…&size=9&colour=black`), so back/forward and sharing work and there's no server session to manage.
- **Detected filters shown as chips**: "black nike size 9" displays `Nike ×` `Black ×` `Size 9 ×`. Removing a chip updates the URL. Customers see how their words were understood.
- **Facet filters** (brand, size, colour, price) with counts.
- **Honest relaxation**: "No black size 9 in stock — showing other colours in size 9."
- **"Ask Lino" entry** under the results for natural-language queries: opens Lino seeded with the query and the current results, so the conversation continues from what's on screen. Lino never blocks the grid.
- Remove the Fuse.js hook and the `getAllProducts` call from the search page.

### 2.5 Lino rebuild

- **Tool**: `search_products({ query, brand?, category?, gender?, colour?, size?, minPrice?, maxPrice?, sort?, excludeIds? })`.
  - `query` is the customer's need in natural language ("cushioned for standing all day"), which goes to hybrid retrieval. This is the main fix for "same products".
  - `brand`/`category`/`colour`/`size` are validated against the real catalog values; unknown values are dropped rather than sent to the DB.
  - `excludeIds` lets "show me something different" actually return different products.
- **Conversation state handled in code, not by prompt pleading**: store the last search (filters + query + shown ids) on the conversation. Give the model the previous search once, as structured data, and let it decide what to keep. Remove the duplicate "ACTIVE FILTERS" block and the semantic-intent block.
- **Streaming on the website**: switch the website to `/lino/chat-stream`, render products the moment the tool result arrives, then stream the text.
- **Use the last search's results** in both endpoints (fix `extractProductsFromMessages`).
- **Smaller prompt and payloads**: cut the system prompt to the essentials; send the model ~8 compact products (name, brand, price, sizes, colours, 1-line summary).
- Check what model production uses (`AI_PROVIDER`), and pick a fast tool-calling model for Lino.

### 2.6 What gets deleted or merged

| Delete | Why |
|---|---|
| `BuyBox-Customer-Website/src/hooks/products/useSearchProducts.ts` (Fuse) | replaced by backend search |
| `src/lino/search/semantic-intent.ts`, `semantic-intent.spec.ts`, `semantic-evals.ts` | replaced by the grounded parser + embeddings |
| `src/lino/search/biomechanical-dictionary.ts` | knowledge moves into Atlas synonyms and the embedded text |
| `src/product/utils/search-tags.util.ts`, `searchTags` field + index, `sync-search-tags.ts`, `revert-search-tags.ts` | already deprecated, unused |

| Move / reuse | Where |
|---|---|
| `SearchService`, `search-attempts.ts`, `variant-matcher.ts`, `product-ranker.ts`, `clean-filters.ts`, types | new `src/search/` module, used by both `SearchController` and Lino's `ToolsService` |
| `SearchRepository` | rewritten around `aggregateRaw` + Atlas indexes |

---

## 3. Phases

### Phase 0 — Measure (½ day)
- Add timing logs / a `Server-Timing` header to `/product/get-all-product`, `/lino/chat` and `/lino/chat-stream`: DB time, LLM time per step, total.
- Measure the `get-all-product` response size (the 2 MB cache question) and cold-start time on Vercel.
- Note the production AI provider/model and the real category/sub-category names.
- Save ~30 real queries (navbar analytics `SEARCH` events + Lino logs) as the **evaluation set**, with what a good answer looks like.

### Phase 1 — Search core + index (backend)
- `src/search/` module; `ProductSearchDoc` Prisma model; index builder + rebuild script; hooks on product/variant/inventory changes.
- Atlas Search index (with autocomplete + synonyms) and Vector Search index definitions committed to the repo as JSON.
- Grounded parser with tests (brands/colours/sizes/prices/gender, whole-word only).
- `GET /search` and `GET /search/suggest`.
- Eval script: run the evaluation set, print results side by side.

### Phase 2 — Navbar & results page (website)
- Server-rendered `/search` with chips, facets, relaxation notice, pagination, empty/error states.
- Typeahead suggestions in `SearchBar`.
- Remove Fuse.js path. Keep tracking `SEARCH` events; add result count and `tookMs`.

### Phase 3 — Lino on the shared core
- New tool schema calling `SearchCore`; validated values; `excludeIds`.
- Structured conversation state; remove semantic-intent and duplicate filter blocks; slim the prompt.
- Website switches to streaming; products render first.

### Phase 4 — Clean-up & tune
- Delete the files listed in 2.6.
- Tune boosts, synonyms and fusion weights against the evaluation set.
- Decide on hosting if cold starts are a measurable problem (see open questions).

---

## 4. Success measures

| Measure | Today | Target |
|---|---|---|
| Navbar: time until product cards are visible | measure in Phase 0 | < 500 ms warm |
| Search API server time | — | < 150 ms p95 (warm, embedding cached) |
| Typeahead response | — | < 150 ms |
| Lino: time until first products shown | full answer wait | < 2.5 s |
| Same-products problem | — | different evaluation queries share few top-8 products unless they genuinely should |
| Typo tolerance | Fuse | "addidas", "jordon 4" return the right products |
| Out-of-stock shown | sometimes | never |

---

## 5. Open questions

1. **Embedding provider**: which key is available in production — OpenAI (`text-embedding-3-small`) or Google (Gemini embeddings)? Either works through the AI SDK's `embed`.
2. **Hosting**: if Phase 0 shows multi-second cold starts on Vercel, are you open to keeping the backend warm or moving it to an always-on host?
3. **Atlas tier**: free/shared tiers limit the number of search indexes; this plan needs 2 (search + vector). Which tier is the cluster on?
