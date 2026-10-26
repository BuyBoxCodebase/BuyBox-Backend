import { Injectable, Logger } from '@nestjs/common';
import { PipelineStage } from 'mongoose';
import { getSearchModels } from '../db/search-connection';
import { ProductSearchDoc } from '../db/search-models';
import { Candidate, toCandidate } from '../matching/candidate';
import { gendersFor, normaliseKey } from '../query/normalise';
import { SearchFilters } from '../search.types';
import { EmbeddingService } from './embedding.service';
import { fuseRankings } from './rank-fusion';

// Atlas indexes on the ProductSearchDoc collection. They exist on the cluster and update themselves as
// documents change; on a new cluster, run POST /search/reindex first (it creates the SearchSynonym
// collection), then create both in Atlas → Search & Vector Search with exactly these names:
//
// product_search (Atlas Search), dynamic: false, fields:
//   name, brand            string + autocomplete (edgeGram, minGrams 2, maxGrams 15, foldDiacritics)
//                          name uses lucene.english, brand lucene.standard
//   modelName              string (lucene.standard)
//   category, subCategory, description   string (lucene.english)
//   brandKey, categoryKeys, gender, colourKeys, sizeKeys   token
//   minPrice, maxPrice     number
//   synonyms: { name: "shoe_terms", analyzer: "lucene.english", source: { collection: "SearchSynonym" } }
//
// product_vector (Atlas Vector Search):
//   embedding              vector, numDimensions 1536 (must match EMBEDDING_DIMENSIONS), similarity cosine
//   brandKey, categoryKeys, gender, colourKeys, sizeKeys, minPrice, maxPrice   filter
//
// A new filter field goes into both indexes and into buildMongoFilter / buildSearchFilter below.
const SEARCH_INDEX = 'product_search';
const VECTOR_INDEX = 'product_vector';
const SYNONYMS = 'shoe_terms';

const KEYWORD_LIMIT = 60;
const VECTOR_LIMIT = 60;
const VECTOR_CANDIDATES = 400; // how many neighbours Atlas considers before picking the closest VECTOR_LIMIT
const LISTING_LIMIT = 2000; // filter-only searches return every match; the catalog stays under 2,000

// Vector search always returns its nearest products, even when none are relevant. These cut-offs drop
// the weak tail. Atlas reports cosine similarity as (1 + cos) / 2, so 0.6 means cos 0.2.
// Tune both against real queries (see the evaluation queries in .plan/unified-search-plan.md).
const MIN_VECTOR_SCORE = 0.6;
const VECTOR_SCORE_WINDOW = 0.08; // also drop hits far below the best hit
// Keyword hits that only matched a stray word score far below the best hit.
const MIN_KEYWORD_SCORE_RATIO = 0.2;

const WITHOUT_EMBEDDING = { embedding: 0 } as const;

export interface RetrievalQuery {
  text: string; // meaning search; empty for filter-only searches
  keywordText: string; // keyword search; may be empty even when text is not
  filters: SearchFilters;
}

// Finds candidate products. Brand, category, gender, colour, size and price range are applied here
// as pre-filters on the search document; exact variant matching and stock happen afterwards.
@Injectable()
export class Retriever {
  private readonly logger = new Logger(Retriever.name);

  constructor(private readonly embeddings: EmbeddingService) {}

  // Candidates in relevance order (newest first for filter-only searches).
  async retrieve({ text, keywordText, filters }: RetrievalQuery): Promise<Candidate[]> {
    if (!text) return this.listing(filters);

    // If one side fails (e.g. its Atlas index is missing or still building), the other still answers.
    const [keyword, vector] = await Promise.allSettled([
      keywordText ? this.keywordSearch(keywordText, filters) : Promise.resolve([]),
      this.vectorSearch(text, filters),
    ]);
    if (keyword.status === 'rejected' && vector.status === 'rejected') throw keyword.reason;
    if (keyword.status === 'rejected') this.logger.error(`Keyword search failed: ${keyword.reason?.message}`);
    if (vector.status === 'rejected') this.logger.error(`Vector search failed: ${vector.reason?.message}`);

    const keywordHits = keyword.status === 'fulfilled' ? keyword.value : [];
    const vectorHits = vector.status === 'fulfilled' ? vector.value : [];

    const byId = new Map<string, Candidate>();
    for (const hit of [...keywordHits, ...vectorHits]) byId.set(hit.candidate.id, hit.candidate);

    const ranked = fuseRankings([keywordHits.map((hit) => hit.candidate.id), vectorHits.map((hit) => hit.candidate.id)]);
    return ranked.map((id) => byId.get(id));
  }

  private async listing(filters: SearchFilters): Promise<Candidate[]> {
    const { ProductSearchDoc } = await getSearchModels();
    const docs = await ProductSearchDoc.find(buildMongoFilter(filters), WITHOUT_EMBEDDING)
      .sort({ productCreatedAt: -1 })
      .limit(LISTING_LIMIT)
      .lean();
    return docs.map(toCandidate);
  }

  private async keywordSearch(keywordText: string, filters: SearchFilters): Promise<ScoredCandidate[]> {
    const { ProductSearchDoc } = await getSearchModels();
    const fuzzy = { maxEdits: 1, prefixLength: 1 }; // "addidas" -> Adidas, "jordon" -> Jordan
    const filterClauses = buildSearchFilter(filters);

    const pipeline: PipelineStage[] = [
      {
        $search: {
          index: SEARCH_INDEX,
          compound: {
            should: [
              { text: { query: keywordText, path: ['name', 'modelName'], fuzzy, score: { boost: { value: 5 } } } },
              { text: { query: keywordText, path: 'brand', fuzzy, score: { boost: { value: 4 } } } },
              { text: { query: keywordText, path: ['category', 'subCategory'], score: { boost: { value: 2 } } } },
              { text: { query: keywordText, path: 'name', synonyms: SYNONYMS, score: { boost: { value: 2 } } } },
              { text: { query: keywordText, path: 'description', synonyms: SYNONYMS } },
            ],
            minimumShouldMatch: 1,
            ...(filterClauses.length > 0 ? { filter: filterClauses } : {}),
          },
        },
      } as PipelineStage,
      { $limit: KEYWORD_LIMIT },
      { $addFields: { score: { $meta: 'searchScore' } } },
      { $project: WITHOUT_EMBEDDING },
    ];

    const rows = await ProductSearchDoc.aggregate(pipeline);
    const best = rows[0]?.score ?? 0;
    return rows.filter((row) => row.score >= best * MIN_KEYWORD_SCORE_RATIO).map(toScored);
  }

  private async vectorSearch(text: string, filters: SearchFilters): Promise<ScoredCandidate[]> {
    let queryVector: number[];
    try {
      queryVector = await this.embeddings.embedQuery(text);
    } catch (error) {
      // Without the embedding API the search still works on keywords alone.
      this.logger.error(`Embedding failed, using keyword search only: ${error.message}`);
      return [];
    }

    const { ProductSearchDoc } = await getSearchModels();
    const filter = buildMongoFilter(filters);
    const pipeline: PipelineStage[] = [
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: 'embedding',
          queryVector,
          numCandidates: VECTOR_CANDIDATES,
          limit: VECTOR_LIMIT,
          ...(Object.keys(filter).length > 0 ? { filter } : {}),
        },
      } as PipelineStage,
      { $addFields: { score: { $meta: 'vectorSearchScore' } } },
      { $project: WITHOUT_EMBEDDING },
    ];

    const rows = await ProductSearchDoc.aggregate(pipeline);
    const cutoff = Math.max(MIN_VECTOR_SCORE, (rows[0]?.score ?? 0) - VECTOR_SCORE_WINDOW);
    return rows.filter((row) => row.score >= cutoff).map(toScored);
  }
}

interface ScoredCandidate {
  candidate: Candidate;
  score: number;
}

function toScored(row: ProductSearchDoc & { score: number }): ScoredCandidate {
  return { candidate: toCandidate(row), score: row.score };
}

// Filters for find() and for $vectorSearch (which accepts the same operators on its filter fields).
function buildMongoFilter(filters: SearchFilters): Record<string, any> {
  const conditions: Record<string, any>[] = [];

  if (filters.brand) conditions.push({ brandKey: { $eq: normaliseKey(filters.brand) } });
  if (filters.category) conditions.push({ categoryKeys: { $in: [normaliseKey(filters.category)] } });
  if (filters.gender) conditions.push({ gender: { $in: gendersFor(filters.gender) } });
  if (filters.colour) conditions.push({ colourKeys: { $in: [filters.colour] } });
  if (filters.size) conditions.push({ sizeKeys: { $in: [filters.size] } });
  // A product qualifies when some of its in-stock prices fall inside the range.
  if (filters.maxPrice !== undefined) conditions.push({ minPrice: { $lte: filters.maxPrice } });
  if (filters.minPrice !== undefined) conditions.push({ maxPrice: { $gte: filters.minPrice } });

  return conditions.length > 0 ? { $and: conditions } : {};
}

// The same filters as Atlas Search compound.filter clauses.
function buildSearchFilter(filters: SearchFilters): Record<string, unknown>[] {
  const clauses: Record<string, unknown>[] = [];

  if (filters.brand) clauses.push({ in: { path: 'brandKey', value: [normaliseKey(filters.brand)] } });
  if (filters.category) clauses.push({ in: { path: 'categoryKeys', value: [normaliseKey(filters.category)] } });
  if (filters.gender) clauses.push({ in: { path: 'gender', value: gendersFor(filters.gender) } });
  if (filters.colour) clauses.push({ in: { path: 'colourKeys', value: [filters.colour] } });
  if (filters.size) clauses.push({ in: { path: 'sizeKeys', value: [filters.size] } });
  if (filters.maxPrice !== undefined) clauses.push({ range: { path: 'minPrice', lte: filters.maxPrice } });
  if (filters.minPrice !== undefined) clauses.push({ range: { path: 'maxPrice', gte: filters.minPrice } });

  return clauses;
}

// Products whose name or brand starts with what the customer is typing, for search-box suggestions.
export async function autocompleteProducts(prefix: string, limit: number): Promise<Candidate[]> {
  const { ProductSearchDoc } = await getSearchModels();
  const fuzzy = prefix.length >= 4 ? { maxEdits: 1, prefixLength: 2 } : undefined;
  const rows = await ProductSearchDoc.aggregate([
    {
      $search: {
        index: SEARCH_INDEX,
        compound: {
          should: [
            { autocomplete: { query: prefix, path: 'name', ...(fuzzy ? { fuzzy } : {}), score: { boost: { value: 2 } } } },
            { autocomplete: { query: prefix, path: 'brand', ...(fuzzy ? { fuzzy } : {}) } },
          ],
          minimumShouldMatch: 1,
        },
      },
    } as PipelineStage,
    { $limit: limit },
    { $project: WITHOUT_EMBEDDING },
  ]);
  return rows.map(toCandidate);
}
