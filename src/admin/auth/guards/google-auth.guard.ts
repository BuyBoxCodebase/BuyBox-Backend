import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAdminAuthGuard extends AuthGuard('google-admin') { }