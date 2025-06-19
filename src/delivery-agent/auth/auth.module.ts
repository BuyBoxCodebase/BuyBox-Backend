import { Module } from '@nestjs/common';
import { DeliveryAgentAuthService } from './auth.service';
import { DeliveryAgentAuthController } from './auth.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { MailerModule } from 'src/mailer/mailer.module';
import { JwtStrategy } from './strategy/jwt.strategy';
import { GoogleStrategySeller } from './strategy/google.strategy';

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
    DeliveryAgentAuthController,
  ],
  providers: [
    ConfigService,
    JwtStrategy,
    GoogleStrategySeller,
    DeliveryAgentAuthService,
  ],
})
export class DeliveryAgentAuthModule { }
