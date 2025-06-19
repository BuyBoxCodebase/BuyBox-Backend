import { Controller, Post, Body, UseGuards, Req, Get, Redirect, Res, Patch, UseInterceptors, BadRequestException, UploadedFiles } from '@nestjs/common';
import { CustomerAuthService } from './auth.service';
import { GoogleCustomerAuthGuard } from './guards/google-auth.guard';
import { FacebookAuthGuard } from './guards/facebook-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SessionAuthGuard } from '@app/shared';

@Controller('customer/auth')
export class CustomerAuthController {
  constructor(
    private readonly customerAuthService: CustomerAuthService,
  ) { }

  @Post('register')
  async registerCustomer(@Body() body: { email: string; password: string; name: string; phoneNumber: string }) {
    return this.customerAuthService.registerCustomer(body.email, body.password, body.name, body.phoneNumber);
  }

  @Post('verify')
  async verifyCustomer(@Body() body: { activationToken: string; activationCode: string; }) {
    return this.customerAuthService.verifyCustomer(body.activationToken, body.activationCode);
  }

  @Post('login')
  async loginCustomer(@Body() body: { email: string; password: string }) {
    return this.customerAuthService.loginCustomer(body.email, body.password);
  }

  @UseGuards(SessionAuthGuard)
  @Post('logout')
  async logout(@Req() req) {
    return this.customerAuthService.logoutCustomer(req);
  }
  @Post('google/mobile')
  async googleMobileAuth(@Body() body: { idToken: string }) {
    return this.customerAuthService.verifyGoogleIdToken(body.idToken);
  }

  @UseGuards(GoogleCustomerAuthGuard)
  @Get('google')
  async googleAuthCustomer() { }

  @UseGuards(GoogleCustomerAuthGuard)
  @Get('google/callback')
  async googleAuthCallbackCustomer(@Req() req, @Res() res) {
    req.login(req.user, (err) => {
      if (err) {
        console.error('Login error:', err);
        return res.redirect('http://localhost:5173/customer?auth=error');
      }

      console.log('User logged in, session:', req.session);

      // Force session save
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('http://localhost:5173/customer?auth=failed');
        }

        if (!req.user.isCompleted) {
          return res.redirect('http://localhost:5173/customer?auth=pending');
        }

        return res.redirect('http://localhost:5173/customer?auth=success');
      });
    });
  }

  @UseGuards(FacebookAuthGuard)
  @Get('facebook')
  @Redirect()
  async facebookAuth() {
    return { url: 'https://www.facebook.com/v10.0/dialog/oauth' };
  }

  @UseGuards(FacebookAuthGuard)
  @Get('facebook/callback')
  async facebookLogin(@Req() req) {
    return this.customerAuthService.facebookLogin(req.user);
  }
}
