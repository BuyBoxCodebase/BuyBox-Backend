import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';
import { SessionAuthGuard } from '../../../../libs/shared/src';

@Controller('seller/2fa')
export class TwoFactorController {
    constructor(private readonly twoFactorService: TwoFactorService) { }

    @UseGuards(SessionAuthGuard)
    @Get('generate')
    async generateTwoFactorAuth(@Req() req) {
        const { secret, qrCodeUrl } = await this.twoFactorService.generateTwoFactorSecret(
            req.user.userId,
            'SELLER'
        );

        req.session.twoFactorSecret = secret;

        return { qrCodeUrl };
    }

    @UseGuards(SessionAuthGuard)
    @Post('verify')
    async verifyTwoFactorCode(@Req() req, @Body() body: { code: string }) {
        const isValid = await this.twoFactorService.verifyTwoFactorCode(
            body.code,
            req.session.twoFactorSecret
        );

        if (isValid) {
            // Enable 2FA for the user
            await this.twoFactorService.enableTwoFactor(req.user.userId, 'SELLER');

            delete req.session.twoFactorSecret;

            return { success: true };
        }

        return { success: false, message: 'Invalid verification code' };
    }

    @UseGuards(SessionAuthGuard)
    @Post('validate')
    async validateTwoFactorCode(@Req() req, @Body() body: { code: string }) {
        const user = await req.user;

        const isValid = await this.twoFactorService.verifyTwoFactorCode(
            body.code,
            user.twoFactorSecret
        );

        if (isValid) {
            req.session.twoFactorVerified = true;
            await new Promise<void>((resolve, reject) => {
                req.session.save((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            return { success: true };
        }

        return { success: false, message: 'Invalid verification code' };
    }

    @UseGuards(SessionAuthGuard)
    @Post('disable')
    async disableTwoFactor(@Req() req) {
        await this.twoFactorService.disableTwoFactor(req.user.userId, 'SELLER');

        req.session.twoFactorVerified = false;

        return { success: true };
    }
}