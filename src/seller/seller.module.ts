import { Module } from '@nestjs/common';
import { SellerAuthModule } from './auth/auth.module';
import { SellerProfileModule } from './profile/profile.module';

@Module({
  imports: [
    SellerAuthModule,
    SellerProfileModule,
  ],
  exports: [SellerAuthModule],
})
export class SellerModule { }
