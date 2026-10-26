import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { CloudinaryModule } from '../../src/cloudinary/cloudinary.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    SearchModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule { }
