import { Module } from '@nestjs/common';
import { DeliveryAgentAuthModule } from './auth/auth.module';
import { DeliveryAgentProfileModule } from './profile/profile.module';

@Module({
  imports: [
    DeliveryAgentAuthModule,
    DeliveryAgentProfileModule,
  ]
})
export class DeliveryAgentModule { }
