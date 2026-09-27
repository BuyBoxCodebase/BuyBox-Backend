import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { LinoController } from './lino.controller';
import { LinoService } from './services/lino.service';
import { AiProviderService } from './services/ai-provider.service';
import { IntentService } from './services/intent.service';
import { SearchService } from './services/search.service';
import { ToolsService } from './services/tools.service';
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
    IntentService,
    SearchService,
    ToolsService,
  ],
})
export class LinoModule {}
