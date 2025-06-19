import { Module } from '@nestjs/common';
import { CustomerAuthModule } from './auth/auth.module';
import { CustomerProfileModule } from './profile/profile.module';

@Module({
    imports: [
        CustomerAuthModule,
        CustomerProfileModule,
    ],
    exports: [CustomerAuthModule],
})
export class CustomerModule { }
