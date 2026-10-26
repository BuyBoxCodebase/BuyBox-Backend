import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LinoController } from './lino.controller';
import { LinoService } from './services/lino.service';
import { AiProviderService } from './services/ai-provider.service';
import { ToolsService } from './services/tools.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SearchModule,
  ],
  controllers: [LinoController],
  providers: [
    LinoService,
    AiProviderService,
    ToolsService,
  ],
})
export class LinoModule {}
