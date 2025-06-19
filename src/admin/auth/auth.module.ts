import { Module } from '@nestjs/common';
import { AdminAuthService } from './auth.service';
import { AdminAuthController } from './auth.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailerModule } from '../../mailer/mailer.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { JwtStrategy } from 'src/customer/auth/strategy/jwt.strategy';
import { SessionSerializer } from '../../../libs/shared/src';
import { LocalStrategy } from './strategy/local.strategy';
import { GoogleStrategyAdmin } from './strategy/google.strategy';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({
      defaultStrategy: 'local',
      session: true
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    CloudinaryModule,
    MailerModule,
  ],
  controllers: [AdminAuthController],
  providers: [
    ConfigService,
    AdminAuthService,
    JwtStrategy,
    GoogleStrategyAdmin,
    LocalStrategy,
    SessionSerializer,
  ],
})
export class AdminAuthModule { }
