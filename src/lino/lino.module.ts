import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LinoController } from './lino.controller';
import { LinoService } from './services/lino.service';
import { AiProviderService } from './services/ai-provider.service';
import { SearchService } from './services/search.service';
import { ToolsService } from './services/tools.service';
import { SearchRepository } from './search/search-repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
  ],
  controllers: [LinoController],
  providers: [
    LinoService,
    AiProviderService,
    SearchService,
    SearchRepository,
    ToolsService,
  ],
})
export class LinoModule {}
