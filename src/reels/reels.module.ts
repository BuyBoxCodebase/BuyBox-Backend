import { Module } from '@nestjs/common';
import { ReelsService } from './reels.service';
import { ReelsController } from './reels.controller';
import { CloudinaryModule } from '../../src/cloudinary/cloudinary.module';
import { PrismaModule } from '../../src/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
  ],
  controllers: [ReelsController],
  providers: [ReelsService],
})
export class ReelsModule { }
