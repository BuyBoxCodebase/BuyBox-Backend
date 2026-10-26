import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogVocabulary } from './catalog/catalog-vocabulary.service';
import { SearchIndexer } from './index/search-indexer.service';
import { EmbeddingService } from './retrieval/embedding.service';
import { Retriever } from './retrieval/retriever.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

// Product search for the navbar and Lino. Uses Mongoose (its own connection) for Atlas Search and
// Vector Search.
@Module({
  imports: [PrismaModule], // for the admin guard on POST /search/reindex
  controllers: [SearchController],
  providers: [SearchService, SearchIndexer, Retriever, EmbeddingService, CatalogVocabulary],
  exports: [SearchService, SearchIndexer, CatalogVocabulary],
})
export class SearchModule {}
