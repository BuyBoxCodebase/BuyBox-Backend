import { Module } from '@nestjs/common';
import { AdminProfileService } from './profile.service';
import { AdminProfileController } from './profile.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
    imports: [
        PrismaModule,
        CloudinaryModule,
    ],
    controllers: [AdminProfileController],
    providers: [AdminProfileService],
})
export class AdminProfileModule { }
