import { Module } from '@nestjs/common';
import { BrandService } from './brand.service';
import { BrandController } from './brand.controller';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { CloudinaryModule } from '../../src/cloudinary/cloudinary.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
  ],
  controllers: [BrandController],
  providers: [BrandService],
})
export class BrandModule { }
