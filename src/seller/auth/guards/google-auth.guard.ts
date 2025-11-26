import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleCustomerAuthGuard extends AuthGuard('google-customer') { }


@Injectable()
export class GoogleSellerAuthGuard extends AuthGuard('google-seller') { }

@Injectable()
export class GoogleAdminAuthGuard extends AuthGuard('google-admin') { }