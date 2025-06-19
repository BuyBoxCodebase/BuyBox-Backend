import { Module } from '@nestjs/common';
import { SellerProfileService } from './profile.service';
import { SellerProfileController } from './profile.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
  ],
  controllers: [SellerProfileController],
  providers: [SellerProfileService],
})
export class SellerProfileModule { }
