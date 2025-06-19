import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class TwoFactorGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();

        if (!request.user?.twoFactorEnabled) {
            return true;
        }

        const twoFactorVerified = request.session.twoFactorVerified;

        if (!twoFactorVerified) {
            throw new UnauthorizedException('Two-factor authentication required');
        }

        return true;
    }
}