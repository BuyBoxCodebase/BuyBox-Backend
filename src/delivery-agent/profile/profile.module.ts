import { Module } from '@nestjs/common';
import { DeliveryAgentProfileService } from './profile.service';
import { DeliveryAgentProfileController } from './profile.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
  ],
  controllers: [DeliveryAgentProfileController],
  providers: [DeliveryAgentProfileService],
})
export class DeliveryAgentProfileModule { }
