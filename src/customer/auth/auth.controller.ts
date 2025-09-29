import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Redirect,
  Res,
} from '@nestjs/common';
import { CustomerAuthService } from './auth.service';
import { GoogleCustomerAuthGuard } from './guards/google-auth.guard';
import { FacebookAuthGuard } from './guards/facebook-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

@Controller('customer/auth')
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) { }

  @Post('register')
  async registerCustomer(
    @Body()
    body: {
      email: string;
      password: string;
      name: string;
      phoneNumber: string;
    },
  ) {
    return this.customerAuthService.registerCustomer(
      body.email,
      body.password,
      body.name,
      body.phoneNumber,
    );
  }

  @Post('verify')
  async verifyCustomer(
    @Body() body: { activationToken: string; activationCode: string },
  ) {
    return this.customerAuthService.verifyCustomer(
      body.activationToken,
      body.activationCode,
    );
  }

  @Post('login')
  async loginCustomer(@Body() body: { email: string; password: string }) {
    return this.customerAuthService.loginCustomer(body.email, body.password);
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refreshTokens(@Req() req) {
    return this.customerAuthService.refreshToken(req.user);
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
    const { accessToken: token } = await this.customerAuthService.customerGoogleLogin(
      req.user,
    );
    res.redirect(`https://buybox1.co.za/customer?token=${token}`);
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
