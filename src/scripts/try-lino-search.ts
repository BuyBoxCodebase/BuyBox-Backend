// Runs sample searches through Lino's product search (no AI involved) and prints what comes back.
//
//   npx ts-node src/scripts/try-lino-search.ts
//   npx ts-node src/scripts/try-lino-search.ts '{"brand":"Nike","size":"9","sortPreference":"price_low_to_high"}'

import { PrismaService } from '../prisma/prisma.service';
import { SearchRepository } from '../lino/search/search-repository';
import { SearchService } from '../lino/services/search.service';
import { cleanFilters } from '../lino/search/clean-filters';
import { SearchRequest, SearchResponse } from '../lino/search/search.types';

type ToolArgs = Record<string, any>;

const SAMPLE_SEARCHES: { label: string; args: ToolArgs }[] = [
  { label: 'Everything, default order', args: {} },
  { label: 'Cheapest first', args: { sortPreference: 'price_low_to_high' } },
  { label: 'Page 2 of everything', args: { page: 2 } },
  { label: 'Brand only', args: { brand: 'Nike' } },
  { label: 'Brand + size', args: { brand: 'Nike', size: '9' } },
  { label: 'Colour + size (may loosen)', args: { colour: 'white', size: '9' } },
  { label: 'Tight price (may widen)', args: { maxPrice: 20 } },
  { label: 'Occasion ranking', args: { occasion: 'running' } },
  { label: 'Description keywords ranking', args: { keywords: ['lightweight', 'breathable'] } },
  { label: 'Unknown product name (drops name last)', args: { productName: 'zzzz no such shoe' } },
  { label: 'Unknown brand (never dropped, expect 0)', args: { brand: 'NoSuchBrand' } },
];

function toRequest(args: ToolArgs): SearchRequest {
  return { filters: cleanFilters(args), sort: args.sortPreference ?? 'relevance', page: args.page ?? 1 };
}

function printResponse(label: string, args: ToolArgs, response: SearchResponse) {
  console.log(`\n=== ${label}  ${JSON.stringify(args)}`);
  console.log(
    `total: ${response.totalMatches} | page: ${response.page} | hasMore: ${response.hasMore} | exact: ${response.exactMatch}` +
      ` | dropped: [${response.droppedFilters.join(', ')}] | widenedPrice: ${JSON.stringify(response.widenedPrice)}`,
  );
  for (const product of response.products) {
    console.log(
      `  - ${product.name} (${product.brand ?? 'no brand'}) $${product.price}` +
        ` | sizes: ${product.availableSizes.join(', ') || '-'} | colours: ${product.availableColours.join(', ') || '-'}`,
    );
    console.log(`      description: ${product.description}`);
  }
}

async function main() {
  const prisma = new PrismaService();
  const search = new SearchService(new SearchRepository(prisma));

  const customArgs = process.argv[2] ? JSON.parse(process.argv[2]) : null;
  const searches = customArgs ? [{ label: 'Custom', args: customArgs }] : SAMPLE_SEARCHES;

  try {
    for (const { label, args } of searches) {
      printResponse(label, args, await search.search(toRequest(args)));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
