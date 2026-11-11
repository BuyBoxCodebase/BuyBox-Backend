import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/auth.module';
import { AdminProfileModule } from './profile/profile.module';
import { AdminControlModule } from './control/control.module';
import { AdminVariantsModule } from './variants/variants.module';

@Module({
    imports: [
        AdminAuthModule,
        AdminProfileModule,
        AdminControlModule,
        AdminVariantsModule,
    ],
    exports: [AdminAuthModule],
})
export class AdminModule { }
