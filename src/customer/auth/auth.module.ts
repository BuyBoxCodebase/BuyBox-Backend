import { Module } from '@nestjs/common';
import { CustomerAuthService } from './auth.service';
import { CustomerAuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategy/jwt.strategy';
import { GoogleStrategyCustomer } from './strategy/google.strategy';
import { FacebookStrategy } from './strategy/facebook.strategy';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { MailerModule } from '../../mailer/mailer.module';
import { LocalStrategy } from './strategy/local.strategy';
import { SessionSerializer } from '@app/shared';

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
    LocalStrategy,
    GoogleStrategyCustomer,
    FacebookStrategy,
    CustomerAuthService,
    SessionSerializer,
  ],
  controllers: [CustomerAuthController],
})
export class CustomerAuthModule { }
