import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Google rejects a reused/expired callback `code` with a TokenError; answer 401 instead of a 500.
function rejectOAuthFailure<TUser>(err: any, user: TUser): TUser {
  if (err || !user) {
    throw err?.status ? err : new UnauthorizedException('Google sign-in failed. Please try again.');
  }
  return user;
}

@Injectable()
export class GoogleCustomerAuthGuard extends AuthGuard('google-customer') {
  handleRequest(err: any, user: any) { return rejectOAuthFailure(err, user); }
}


@Injectable()
export class GoogleSellerAuthGuard extends AuthGuard('google-seller') {
  handleRequest(err: any, user: any) { return rejectOAuthFailure(err, user); }
}

@Injectable()
export class GoogleAdminAuthGuard extends AuthGuard('google-admin') {
  handleRequest(err: any, user: any) { return rejectOAuthFailure(err, user); }
}
