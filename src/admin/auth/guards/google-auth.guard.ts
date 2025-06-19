import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAdminAuthGuard extends AuthGuard('google-admin') {
    async canActivate(context: ExecutionContext) {
        const result = (await super.canActivate(context)) as boolean;
        const request = context.switchToHttp().getRequest();

        await new Promise<void>((resolve, reject) => {
            request.session.save((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        return result;
    }
}