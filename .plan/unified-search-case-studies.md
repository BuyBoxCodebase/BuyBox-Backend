# Case Studies: One Search Box for Keywords and Natural Language

How other companies have combined keyword search with conversational, "describe what you need" search, and what BuyBox can learn from them.

> **About the sources.** Each case study names its sources at the end of the file. Some figures come from the company's own engineering posts or papers. Others come from conference talk summaries or third-party write-ups, and those are marked *(secondary)*. Check the original before quoting a number to anyone.

---

## Part 1 — The vocabulary you need first

Every case below is easier to follow once you know the parts that every modern search system has, even if the parts have different names in each company.

### The four stages of a search

```
 customer text
      │
      ▼
┌───────────────────────┐   "black nike size 9 under 100"
│ 1. Query understanding│ → { brand: Nike, colour: black, size: 9, maxPrice: 100 }
└───────────────────────┘
      │
      ▼
┌───────────────────────┐   Find the few hundred products that *could* be relevant,
│ 2. Retrieval          │   fast. Keyword index, vector index, or both.
└───────────────────────┘
      │
      ▼
┌───────────────────────┐   Put the best ones on top: relevance, stock,
│ 3. Ranking            │   popularity, personal history, business rules.
└───────────────────────┘
      │
      ▼
┌───────────────────────┐   Optional: explain the results in words,
│ 4. Generation         │   answer a question, suggest the next step.
└───────────────────────┘
```

- **Query understanding (QU)** turns text into structure: filters (brand, size), a category, and the *intent* (am I buying something specific, or exploring?). This is where LLMs have had their biggest impact in e-commerce, because it is a language problem.
- **Retrieval** is about recall: *don't miss good products*. It must be fast and cheap because it touches the whole catalog.
- **Ranking** is about precision: *put the right products first*. It works on a small pool, so it can afford more expensive logic.
- **Generation** is the newest stage. It is what an assistant like Lino or Amazon's Rufus adds on top.

The proposal for BuyBox is, in these terms: **one query-understanding stage, one retrieval + ranking stage, and an optional generation stage that never does its own retrieval.** That is the same shape almost every case below ended up with.

### Lexical vs. semantic retrieval

- **Lexical (keyword) search** matches words. "Air Force 1" finds products whose text contains those words. It is precise, explainable, and great for exact things like brand names, model numbers and sizes. It fails on vocabulary mismatch: "shoes for standing all day" shares no words with a product description that says "max-cushion midsole".
- **Semantic (embedding / vector) search** turns text into a list of numbers (an *embedding*) so that texts with similar meaning sit close together. It handles "standing all day" ≈ "all-day comfort". It is weaker on exact constraints: an embedding doesn't reliably know that "size 9" excludes size 10.
- **Hybrid search** runs both and merges the results. A common merge method is **Reciprocal Rank Fusion (RRF)**: each product's score is the sum of `1 / (k + rank)` over the lists it appears in. It doesn't care how the two systems scored things, only the order, which makes it robust and easy to tune.

### Head, torso and tail queries

Search traffic follows a power law:

- **Head**: a few hundred queries ("nike", "jordan 4", "sneakers") that make up a large share of all searches.
- **Torso**: thousands of moderately common queries.
- **Tail**: an enormous number of queries that are each rare ("comfortable black shoes for a nurse with flat feet under $100").

This matters because **the head can be precomputed and cached, the tail cannot.** You will see Instacart and DoorDash both run expensive LLM work *offline* for head queries and only pay for real-time LLM calls on the tail. This is the single most important cost and latency idea in this document.

### Grounding

An LLM asked "what category is 'standing all day'?" may invent a category that doesn't exist in your catalog. **Grounding** means giving the model only valid choices (your real categories, brands, sizes) and asking it to pick, or validating its answer against them afterward. DoorDash's design below is the clearest example.

---

## Part 2 — Case studies

### 1. Instacart — "The Intent Engine": LLMs for query understanding, cached for the head

**Context.** Instacart is a grocery marketplace with a huge, constantly changing catalog across many retailers. Grocery queries are short and ambiguous ("milk", "snacks for a party", "something for tacos").

**The problem they had.** Their older query-understanding system learned query rewrites (synonyms, broader terms, substitutes) by mining what users did in search sessions. That only works when a query has enough traffic to learn from. Instacart reports that this approach covered only about **half of search traffic** — the tail had no rewrites at all, so those searches often returned thin or poor results.

**What they built.** An LLM-based "Intent Engine" that produces structured query understanding:

1. **Separate, focused prompts per task.** Instead of one big prompt that does everything, they built distinct prompts for *substitutes*, *broader queries* and *synonyms*, each with chain-of-thought reasoning and few-shot examples. Small, single-purpose prompts are easier to test and less likely to drift.
2. **Grounding in their own data.** Category predictions are grounded in Instacart's taxonomy and in conversion data (what people who typed this query actually bought), so the model chooses from real categories rather than inventing them.
3. **Hybrid batch + real-time serving** *(secondary)*. Head and torso queries are processed **offline in batch** and the results stored in a lookup table. Only tail queries hit a model in real time. For that real-time path they used a **smaller, distilled model** (a fine-tuned Llama 8B is mentioned in their 2025 conference talk) instead of a large general model, to keep latency and cost down.
4. **Discovery content.** A separate effort used LLMs to generate "discovery" content alongside results — for example, suggesting complementary items. They noted a real limitation: general LLMs don't know about new brands or retailer-specific products, so prompts had to be enriched with Instacart's own query-understanding signals.

**Results** *(secondary, from a talk summary)*: large gains for tail queries — reported as roughly +18 points precision and +70 points recall.

**Why this matters for BuyBox.**
- It validates the proposal's "deterministic first, LLM only when needed" idea, but Instacart's version of "deterministic first" is a **cache of LLM outputs** for common queries, not hand-written regexes. BuyBox could do the same cheaply: log every navbar query, and once a query has been resolved by the LLM, store the resolved filters (`query → filters`) and reuse them.
- "One prompt per task" maps neatly onto BuyBox: the resolver's job is narrow (text → `SearchFilters`) and shouldn't share a prompt with Lino's chatty persona.

---

### 2. DoorDash — LLM query understanding with RAG as a guardrail

**Context.** DoorDash search covers restaurants, dishes, and (more recently) grocery and retail. Queries are often compound: "vegan chicken sandwich", "spicy ramen near me", "gluten free pizza".

**The problem.** Compound queries need to be split into parts and each part linked to the right concept. "Vegan chicken sandwich" is *not* a chicken sandwich — "vegan" changes the meaning of "chicken". The system also has strict rules: a dietary restriction must be honoured exactly, never treated as a soft preference. And it had to decide whether a query was about restaurant food or grocery.

**What they built** (DoorDash engineering post, Nov 2024):

1. **Segmentation.** An LLM splits the query into meaningful segments ("vegan" | "chicken sandwich").
2. **Entity linking with retrieval-augmented guardrails.** For each segment, they run an approximate-nearest-neighbour lookup over embeddings of their *existing knowledge graph* (their taxonomy of dishes, cuisines, dietary tags) and retrieve the **top ~100 candidate concepts**. The LLM is then asked to choose from that list. It **cannot invent a concept** that isn't in the taxonomy.
   - This flips the usual RAG pattern. Normally RAG retrieves documents to help an LLM *write an answer*. Here retrieval constrains the LLM's *output vocabulary*.
3. **Hard vs. soft constraints.** Some attributes (dietary restrictions) become strict filters; others become ranking signals. This distinction is designed in, not left to the LLM's judgement each time.
4. **LLM-based evaluation** (separate 2025 post). They built "AutoEval", using LLMs as judges to rate search-result relevance at scale, replacing much of the slow human annotation, and paired it with a *whole-page relevance* metric.

**Results** *(secondary)*: a reported ~30% lift in how often their "popular dish" carousel triggered correctly, and a >2% improvement in whole-page relevance. A 2026 paper evaluated on DoorDash's platform reports that grounding added about +10.9 percentage points of accuracy over an ungrounded LLM.

**Why this matters for BuyBox.**
- **Grounding is cheap for BuyBox.** The catalog's brands, categories, colours and sizes are small sets you can load from the database. The resolver should give the LLM the *actual* lists (or validate its answer against them) instead of free text. Today's tool schema already does this for `category` (a fixed enum) but not for `brand` or `colour`.
- **Hard vs. soft is already in your code.** `SearchService` treats brand/size/colour/price as filters and occasion/keywords as ranking-only. That's exactly DoorDash's split — keep it, and make sure the resolver respects it.
- AutoEval is a model for how to do the proposal's "compare results for representative queries" step without hand-labelling hundreds of queries.

---

### 3. Amazon — Rufus: an assistant that lives *inside* the search box

**Context.** Amazon launched Rufus in February 2024 as a generative shopping assistant in its mobile app.

**The key product decision.** Rufus was not launched as a separate chatbot page. It appears **from the search bar**: you type into the normal search box, and if the query looks like a question or a need ("what do I need for cold weather golf?"), Rufus's answer appears alongside the normal results. You can dismiss it and keep your normal results. That is almost exactly the "one search box" goal in the BuyBox proposal.

**What is known about how it works.**
- Amazon described it as built on an LLM trained on its product catalog, customer reviews, community Q&A and the web.
- Third-party analyses describe it as a multi-stage RAG system: a *query planner* decides what's needed, a *retrieval* layer pulls from catalog, reviews and Q&A, a shopping-specialised model generates the answer, and the answer is **streamed** to the UI. Amazon has not published a detailed architecture, so treat the internal breakdown as an informed guess.

**Lessons that are visible from the product itself.**
1. **Results first, words second.** The product grid doesn't wait for the AI. Rufus's text streams into its own panel. This matches the proposal's "product cards appear without waiting for optional AI wording".
2. **The AI is dismissible.** Customers who just wanted "AA batteries" are not forced into a conversation.
3. **Routing is implicit.** The customer doesn't choose "search mode" vs. "chat mode"; the system decides based on the query. That's the same job the BuyBox resolver will have.

**Why this matters for BuyBox.** It shows the UX target clearly, and it shows the trap to avoid: Amazon can afford an LLM call on many queries. A smaller store has to be stricter about *which* queries pay for an LLM call — which is why the Instacart-style caching matters.

---

### 4. Zalando — the Fashion Assistant: conversation as a layer over existing search

**Context.** Zalando, Europe's large fashion retailer, launched a ChatGPT-powered assistant in beta in spring 2023 (Germany, Austria, UK, Ireland), then expanded it. By 2025 it was described as available to around 50 million customers in 25 markets.

**What it does.** Customers describe a need in their own words — Zalando's own example was "what should I wear to a wedding in Santorini in July?" The assistant replies with a short explanation and **links into Zalando's existing product search results**, then lets the customer refine conversationally. Later versions take location, weather and occasion into account.

**Architectural pattern (as presented publicly).** The LLM's main job is to **translate a vague need into searches the existing catalog engine can run**, then explain them. It does not replace Zalando's search and ranking — it sits on top. The team reported going from concept to public launch in under six months, which is only possible when you reuse the existing search stack rather than building a parallel one.

**Lessons.**
- This is the strongest argument for the proposal's core principle: **the assistant should produce filters, not its own product list.** Lino already does this through `search_products`; the proposal extends the same idea to the navbar.
- Occasion-style requests ("wedding", "standing all day") are where the LLM adds most value. Explicit queries ("black Nike size 9") need almost none.

---

### 5. Etsy — unified embedding retrieval for a catalog with no standard vocabulary

**Context.** Etsy sells handmade and vintage items. Sellers describe products in their own words, so the same item might be called "boho macramé wall hanging" or "woven fibre art". Keyword search struggles badly with this.

**What they built** (paper: "Unified Embedding Based Personalized Retrieval in Etsy Search", 2023, revised 2024):
- A **single embedding model** that combines three kinds of signal, trained together end to end:
  - **Term-based** embeddings (so exact words still matter),
  - **Transformer** embeddings (meaning of the text),
  - **Graph** embeddings (which items are bought/clicked together).
- **Personalisation for broad queries.** For short, popular queries ("necklace"), the system uses the shopper's history to decide which kind of necklace to show, because the query alone has too little information.
- Careful work on **hard negatives** (training examples that look relevant but aren't) — a key reason embedding search often feels "almost right but not quite".
- It runs **alongside** their existing keyword retrieval, not instead of it.

**Results**: in live A/B tests, +5.58% search purchase rate and +2.63% site-wide conversion rate (from the paper).

**Why this matters for BuyBox.** Etsy's problem — seller-written descriptions with inconsistent vocabulary — is BuyBox's problem too, since sellers write descriptions. Etsy needed embeddings to solve it. BuyBox's current backend search has **no semantic retrieval at all**; occasion and keywords only *re-rank* whatever the database returns. For a small catalog that's fine. As the catalog grows, embedding-based retrieval is the step that makes "comfortable shoes for standing all day" find products whose descriptions never use those words.

---

### 6. Walmart — hybrid retrieval: inverted index + embeddings

**Context.** Walmart's catalog is enormous and many queries are long-tail.

**What they built** ("Semantic Retrieval at Walmart", KDD 2022; follow-up "Enhancing Relevance of Embedding-based Retrieval at Walmart", CIKM 2024):
- A **hybrid system**: the traditional inverted (keyword) index stays, and an embedding-based neural retriever is added next to it. Results from both are merged before ranking.
- The embedding retriever's job is specifically the **tail**, where keyword matching fails.
- The 2024 follow-up tackles two classic failures of embedding search: **noisy training data** (false positives/negatives from click logs) and **misspellings**. They introduced a *Relevance Reward Model* trained on human relevance judgements to clean up the training signal.

**Why this matters for BuyBox.**
- It shows that semantic search **does not replace** keyword search even at the largest scale. Keyword search remains the backbone for exact intent.
- **Misspellings** are a real issue. BuyBox's current navbar search, through Fuse.js, *does* tolerate typos ("addidas", "jordon"). The backend's `contains` matching does not. Moving the navbar to the backend without adding typo tolerance would make some searches worse. Walmart had to work on this deliberately; so will BuyBox.

---

### 7. Shopify — embeddings as shared infrastructure, kept fresh in real time

**Context.** Shopify powers millions of independent stores, each with its own catalog, and offers semantic search to storefronts.

**What they built** (Shopify Engineering, republished by Google Cloud, 2024):
- Text and image **embeddings for products** as a **shared set of ML building blocks**, reused by search, recommendations and other features rather than built separately per feature.
- A **streaming pipeline** that updates embeddings as products change — about 2,500 embeddings per second, ~216 million per day.

**Lessons.**
- **Freshness is a first-class requirement.** BuyBox learned this the hard way with search tags (see the deprecation note in `src/product/utils/search-tags.util.ts`: tags went stale because they were only rebuilt on create/update). Any embedding index must be updated whenever a product, variant, option value or inventory changes — or, better, store only *product-level meaning* in the embedding and keep *stock/size/colour/price* checks live, as `variant-matcher.ts` already does.
- **Build it once, use it everywhere.** The same product embeddings could power navbar search, Lino, "similar products", and the visual sneaker search already planned in `.plan/visual-sneaker-search.md`.

---

### 8. Uber Eats — a knowledge graph first, then semantic search

**Context.** Uber Eats' 2018 engineering post on query understanding predates LLMs but is useful as history.

**What they built.** A **food knowledge graph** (dishes, cuisines, ingredients and how they relate) and query expansion learned from it, so "sushi" also finds restaurants that sell "sashimi" and "maki". More recent descriptions *(secondary)* cover a large-scale semantic (embedding) search platform built on top.

**Lesson.** The structured vocabulary (taxonomy / knowledge graph) came **first** and the ML came **on top of it**. DoorDash's later LLM work depended on exactly this kind of graph. For BuyBox, the equivalent is cheap: clean, consistent **brands, categories, colours, sizes and product attributes** in the database. The `SNEAKER_BIOMECHANICAL_DICTIONARY` in `src/lino/search/biomechanical-dictionary.ts` is a small, hand-written version of this idea — but its attribute names don't match what's stored on products (see the codebase analysis).

---

### Comparison: three companies, three placements of the LLM

A useful framing (from a ByteByteGo comparison of DoorDash, Instacart and Uber Eats): each company put the LLM in a different place in the pipeline.

| Company | Where the LLM runs | When it runs | How it's kept honest |
|---|---|---|---|
| Instacart | Query understanding (rewrites, categories) | Mostly offline for head queries; small distilled model online for the tail | Grounded in taxonomy + conversion data |
| DoorDash | Query understanding (segmentation, entity linking) | Online per query segment | Must pick from top-100 retrieved taxonomy concepts |
| Amazon Rufus | Generation on top of retrieval | Online, streamed next to results | Retrieval over catalog/reviews; dismissible UI |
| Zalando | Translating needs into catalog searches + explaining | Online in conversation | Uses existing search engine for products |
| Etsy / Walmart / Shopify | Not an LLM — embedding models in retrieval | Embeddings computed offline/streaming; lookup online | Hybrid with keyword index |

**Nobody lets the LLM pick the products directly.** Every system uses the model to understand the request or explain the results, and leaves retrieval and ranking to a deterministic, testable engine. That is the core of the BuyBox proposal, and it's well supported.

---

## Part 3 — Patterns that repeat across every case

1. **Separate understanding from retrieval.** The LLM (or rules) produces a structured query; a deterministic engine finds and ranks products. This makes results testable, cacheable and explainable ("we dropped colour because nothing matched").

2. **Pay for intelligence only where it's needed.** Head queries are cached or handled by rules; LLMs are used for the tail. Explicit queries ("nike size 9") should never wait for a model.

3. **Ground every LLM output.** Give the model the real list of brands, categories and attribute values, or validate its output against them. Unknown values are dropped, not passed to the database.

4. **Hard filters vs. soft preferences.** Explicit constraints (size, price, dietary rule) filter. Fuzzy wishes (comfortable, for a wedding) rank. Mixing these up causes either empty results or irrelevant ones.

5. **Hybrid retrieval wins.** Keywords for precision, embeddings for meaning, merged (often with RRF). Neither alone is enough.

6. **Results first, explanation second.** The product grid renders as soon as retrieval finishes; generated text streams in separately and can be dismissed.

7. **Keep the index fresh, keep stock live.** Meaning (descriptions, embeddings) can be indexed; stock, price and variant availability should be checked at query time.

8. **Evaluate continuously, cheaply.** A fixed set of representative queries, scored automatically (rules, or LLM-as-judge like DoorDash's AutoEval), run on every change.

9. **Log everything.** Query text, resolved filters, which path resolved it (rules / cache / LLM), whether filters were loosened, and whether the customer clicked or bought. This data later becomes your cache, your evaluation set and your training data.

---

## Part 4 — What this means for BuyBox, concretely

A rough maturity ladder, from what you have to where these companies are:

| Step | What | Who did this | Effort for BuyBox |
|---|---|---|---|
| 0 (today) | Navbar: Fuse.js over the whole catalog in the browser. Lino: LLM tool call → `SearchService`. | — | — |
| 1 | One backend endpoint; rules + LLM resolver → `SearchService`; navbar and Lino share it. | Zalando's layering | The proposal |
| 2 | Cache resolved filters per normalised query; LLM only on cache miss. | Instacart | Small |
| 3 | Grounded resolver: real brands/colours/sizes from DB; unknown values dropped. | DoorDash | Small |
| 4 | Typo tolerance + text index (MongoDB Atlas Search, if the database is on Atlas). | Walmart (misspellings) | Medium |
| 5 | Product embeddings + hybrid retrieval (Atlas Vector Search + `$rankFusion`), kept fresh on product updates. | Etsy, Walmart, Shopify | Medium–large |
| 6 | Evaluation set + automatic scoring; click/purchase logging feeding ranking. | DoorDash AutoEval, Etsy | Ongoing |

Note on step 4–5: the BuyBox database is MongoDB (via Prisma). If it's hosted on MongoDB Atlas, Atlas offers keyword search (`$search`, with fuzzy matching for typos), vector search (`$vectorSearch`), and native hybrid merging with `$rankFusion` / `$scoreFusion` (generally available as of mid-2026, MongoDB 8.0+). Prisma doesn't model these stages directly, so they'd be called through `aggregateRaw`. That would let BuyBox follow the Walmart/Etsy hybrid pattern without adding a separate search service.

---

## Sources

**Instacart**
- [Building The Intent Engine: How Instacart is Revamping Query Understanding with LLMs](https://tech.instacart.com/building-the-intent-engine-how-instacart-is-revamping-query-understanding-with-llms-3ac8051ae7ac)
- [Supercharging Discovery in Search with LLMs](https://tech.instacart.com/supercharging-discovery-in-search-with-llms-556c585d4720)
- [AI Engineer talk: How Instacart transformed its search and discovery](https://ai.engineer/talks/how-instacart-transformed-its-search-and-discovery-using-an-llm-driven-approach)
- *(secondary)* [ZenML summary: LLM-enhanced search and discovery for grocery e-commerce](https://www.zenml.io/llmops-database/llm-enhanced-search-and-discovery-for-grocery-e-commerce)

**DoorDash**
- [DoorDash engineering: How DoorDash leverages LLMs for better search retrieval](https://careersatdoordash.com/?p=13271)
- [DoorDash engineering: LLM-evaluated search (AutoEval)](https://careersatdoordash.com/?p=14757)
- [arXiv 2603.01486 — grounded LLM query understanding evaluated on DoorDash](https://arxiv.org/pdf/2603.01486)
- *(secondary)* [ZenML summary: LLMs for enhanced search retrieval and query understanding](https://www.zenml.io/llmops-database/llms-for-enhanced-search-retrieval-and-query-understanding)

**Comparison**
- *(secondary)* [ByteByteGo: Why DoorDash, Instacart, and Uber Eats integrated LLMs into search three different ways](https://blog.bytebytego.com/p/why-doordash-instacart-and-uber-eats)

**Amazon Rufus**
- [Supermarket News: Amazon launches AI-powered shopping assistant Rufus](https://www.supermarketnews.com/news/amazon-launches-ai-powered-shopping-assistant-rufus)
- *(secondary)* [Alby: UX review of Rufus](https://alby.com/?p=883)

**Zalando**
- [Zalando corporate: Zalando to launch a fashion assistant powered by ChatGPT](https://corporate.zalando.com/en/node/10422)
- [CX Network: How Zalando built, released and scaled an AI-powered assistant for 50 million customers](https://www.cxnetwork.com/replay-video/content/zalando-ai-assistant)

**Etsy**
- [Unified Embedding Based Personalized Retrieval in Etsy Search (arXiv 2306.04833)](https://arxiv.org/abs/2306.04833v2)

**Walmart**
- [Semantic Retrieval at Walmart (arXiv 2412.04637, KDD 2022)](https://arxiv.org/abs/2412.04637v1)
- [Enhancing Relevance of Embedding-based Retrieval at Walmart (CIKM 2024)](https://www.catalyzex.com/paper/enhancing-relevance-of-embedding-based)

**Shopify**
- [Shopify Engineering: How Shopify improved consumer search intent with real-time ML](https://shopify.engineering/how-shopify-improved-consumer-search-intent-with-real-time-ml)

**Uber Eats**
- [Uber Engineering: Uber Eats query understanding](https://www.uber.com/blog/uber-eats-query-understanding/)

**MongoDB hybrid search**
- [MongoDB docs: Hybrid search](https://www.mongodb.com/docs/vector-search/hybrid-search/hybrid-search-overview/)
- [MongoDB: Now GA — Hybrid Search with $rankFusion and $scoreFusion](https://www.mongodb.com/products/updates/now-ga-hybrid-search-with-rankfusion-and-scorefusion/)
