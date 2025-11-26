import { Module } from '@nestjs/common';
import { SellerAuthService } from './auth.service';
import { SellerAuthController } from './auth.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { MailerModule } from 'src/mailer/mailer.module';
import { GoogleStrategySeller } from './strategy/google.strategy';
import { JwtStrategy } from './strategy/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' }, // Token expiration time
      }),
      inject: [ConfigService],
    }),
    CloudinaryModule,
    MailerModule,
  ],
  controllers: [
    SellerAuthController,
  ],
  providers: [
    ConfigService,
    JwtStrategy,
    GoogleStrategySeller,
    SellerAuthService,
  ],
})
export class SellerAuthModule { }
