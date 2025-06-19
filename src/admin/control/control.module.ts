import { Module } from '@nestjs/common';
import { AdminControlService } from './control.service';
import { AdminControlController } from './control.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
    imports: [
        PrismaModule,
    ],
    controllers: [AdminControlController],
    providers: [AdminControlService],
})
export class AdminControlModule { }
