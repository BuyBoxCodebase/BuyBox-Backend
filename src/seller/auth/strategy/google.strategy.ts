import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { SellerAuthService } from '../auth.service';

@Injectable()
export class GoogleStrategySeller extends PassportStrategy(Strategy, 'google-seller') {
    constructor(
        private readonly configService: ConfigService,
        private readonly authService: SellerAuthService,
    ) {
        super({
            clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
            clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
            callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL_SELLER'),
            scope: ['email', 'profile'],
            passReqToCallback: true,
        });
    }

    async validate(req: any, accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
        const user = await this.authService.sellerGoogleLogin(profile);
        done(null, user);
    }
}