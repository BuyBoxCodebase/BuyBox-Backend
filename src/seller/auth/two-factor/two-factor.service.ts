import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import { PrismaService } from '../../../prisma/prisma.service';
import * as QRCode from 'qrcode';

@Injectable()
export class TwoFactorService {
    constructor(private prisma: PrismaService) { }

    async generateTwoFactorSecret(userId: string, userType: 'SELLER') {
        const secret = authenticator.generateSecret();
        const appName = 'BuyBox';

        // Save secret to user record (encrypted in a real scenario)
        if (userType === 'SELLER') {
            await this.prisma.seller.update({
                where: { id: userId },
                data: { twoFactorSecret: secret, twoFactorEnabled: false }
            });
        }

        // Get user email for the otpauth URL
        const user = await this.prisma.seller.findUnique({
            where: { id: userId },
            select: { email: true }
        });

        // Generate otpauth URL
        const otpAuthUrl = authenticator.keyuri(user.email, appName, secret);

        // Generate QR code
        const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);

        return {
            secret,
            qrCodeUrl
        };
    }

    async verifyTwoFactorCode(code: string, secret: string): Promise<boolean> {
        return authenticator.verify({
            token: code,
            secret: secret
        });
    }

    async enableTwoFactor(userId: string, userType: 'SELLER') {
        if (userType === 'SELLER') {
            await this.prisma.seller.update({
                where: { id: userId },
                data: { twoFactorEnabled: true }
            });
        }
        return { success: true };
    }

    async disableTwoFactor(userId: string, userType: 'SELLER') {
        if (userType === 'SELLER') {
            await this.prisma.seller.update({
                where: { id: userId },
                data: {
                    twoFactorEnabled: false,
                    twoFactorSecret: null
                }
            });
        }
        return { success: true };
    }
}