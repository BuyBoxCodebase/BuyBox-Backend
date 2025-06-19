import { Module } from '@nestjs/common';
import { SellerAuthService } from './auth.service';
import { SellerAuthController } from './auth.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { MailerModule } from '../../mailer/mailer.module';
import { GoogleStrategySeller } from './strategy/google.strategy';
import { JwtStrategy } from './strategy/jwt.strategy';
import { LocalStrategy } from './strategy/local.strategy';
import { TwoFactorService } from './two-factor/two-factor.service';
import { TwoFactorController } from './two-factor/two-factor.controller';
import { SessionSerializer } from '../../../libs/shared/src';

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
  controllers: [
    SellerAuthController,
    TwoFactorController,
  ],
  providers: [
    ConfigService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategySeller,
    SellerAuthService,
    TwoFactorService,
    SessionSerializer,
  ],
})
export class SellerAuthModule { }
