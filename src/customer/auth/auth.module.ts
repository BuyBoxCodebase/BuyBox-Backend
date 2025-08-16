import { Module } from '@nestjs/common';
import { CustomerAuthService } from './auth.service';
import { CustomerAuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategy/jwt.strategy';
import { GoogleStrategyCustomer, GoogleStrategySeller } from './strategy/google.strategy';
import { FacebookStrategy } from './strategy/facebook.strategy';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { MailerModule } from '../../mailer/mailer.module';

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
  providers: [
    ConfigService,
    JwtStrategy,
    GoogleStrategyCustomer,
    GoogleStrategySeller,
    FacebookStrategy,
    CustomerAuthService,
  ],
  controllers: [CustomerAuthController],
})
export class CustomerAuthModule { }
