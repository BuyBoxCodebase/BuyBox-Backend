import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override handleRequest to never throw an error for missing/invalid tokens.
  // It simply returns the user if token is valid, or undefined if not.
  handleRequest(err, user, info, context) {
    return user;
  }
}
