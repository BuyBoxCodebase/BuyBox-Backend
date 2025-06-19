import { Injectable, Request } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AdminAuthService } from '../auth.service';

@Injectable()
export class GoogleStrategyAdmin extends PassportStrategy(Strategy, 'google-admin') {
    constructor(
        private readonly configService: ConfigService,
        private readonly authService: AdminAuthService,
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
        const user = await this.authService.googleLogin(profile);
        done(null, user);
    }
}