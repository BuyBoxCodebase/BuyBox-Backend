import { BadRequestException, Body, Controller, Get, Post, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { SellerAuthService } from './auth.service';
import { GoogleSellerAuthGuard } from './guards/google-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TwoFactorService } from './two-factor/two-factor.service';
import { LocalAuthGuard, SessionAuthGuard } from '../../../libs/shared/src';

@Controller('seller/auth')
export class SellerAuthController {
  constructor(
    private readonly sellerAuthService: SellerAuthService,
    private readonly twoFactorService: TwoFactorService,
  ) { }

  @Post("/upload/images")
  @UseGuards(SessionAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 5, {
    fileFilter(req, file, callback) {
      if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
        return callback(new BadRequestException('Only JPG, JPEG, and PNG files are allowed!'), false);
      }
      callback(null, true);
    },
  }))
  uploadProfileImages(@UploadedFiles() files: Array<Express.Multer.File>) {
    return this.sellerAuthService.uploadProfileImage(files);
  }

  @Post('register')
  async sellerRegister(@Body() body: { name: string; email: string; password: string; }) {
    return this.sellerAuthService.registerSeller(body.email, body.password, body.name);
  }

  @Post('verify')
  async verifySeller(@Body() body: { activationToken: string; activationCode: string; }) {
    return this.sellerAuthService.verifySeller(body.activationToken, body.activationCode);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async sellerLogin(@Req() req) {
    if (req.user.twoFactorEnabled) {
      // User has 2FA enabled, set a pending flag in session
      req.session.twoFactorPending = true;

      return {
        requiresTwoFactor: true,
        userId: req.user.userId,
        message: 'Two-factor authentication required'
      };
    }

    // No 2FA required, return the user
    return { user: req.user };
  }

  @Post('login/2fa')
  async verifyTwoFactorLogin(
    @Body() body: { email: string, code: string }
  ) {
    // Find the user by email
    const user = await this.sellerAuthService.findUserByEmail(body.email);

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Invalid request');
    }

    // Verify the 2FA code
    const isValid = await this.twoFactorService.verifyTwoFactorCode(
      body.code,
      user.twoFactorSecret
    );

    if (!isValid) {
      throw new BadRequestException('Invalid authentication code');
    }

    // Complete login
    return {
      user: {
        userId: user.id,
        email: user.email,
        role: "SELLER",
        isCompleted: user.isCompleted,
        profilePic: user.profilePic,
        name: user.name
      }
    };
  }

  @UseGuards(GoogleSellerAuthGuard)
  @Get('google')
  async googleAuthSeller() { }

  @UseGuards(GoogleSellerAuthGuard)
  @Get('google/callback')
  async googleAuthCallbackSeller(@Req() req, @Res() res: Response) {
    console.log('Session before save:', req.session);
    console.log('User object:', req.user);

    if (req.user.twoFactorEnabled) {
      req.session.googleAuthPending = true;
      req.session.googleAuthUser = req.user;

      // Redirect to 2FA page
      return res.redirect('http://localhost:5173/seller/2fa-verification');
    }

    // Manually log the user in
    req.login(req.user, (err) => {
      if (err) {
        console.error('Login error:', err);
        return res.redirect('http://localhost:5173/seller?auth=error');
      }

      console.log('User logged in, session:', req.session);

      // Force session save
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('http://localhost:5173/seller?auth=failed');
        }

        if (!req.user.isCompleted) {
          return res.redirect('http://localhost:5173/seller?auth=pending');
        }

        return res.redirect('http://localhost:5173/seller?auth=success');
      });
    });
  }

  @Post('google/2fa')
  async verifyGoogleTwoFactor(@Req() req, @Body() body: { code: string }, @Res() res: Response) {
    if (!req.session.googleAuthPending || !req.session.googleAuthUser) {
      throw new BadRequestException('Invalid session state');
    }

    const user = req.session.googleAuthUser;

    // Verify the 2FA code
    const isValid = await this.twoFactorService.verifyTwoFactorCode(
      body.code,
      user.twoFactorSecret
    );

    if (!isValid) {
      throw new BadRequestException('Invalid authentication code');
    }

    // Clear pending state
    delete req.session.googleAuthPending;
    delete req.session.googleAuthUser;

    // Complete login
    req.login(user, (err) => {
      if (err) {
        console.error('Login error:', err);
        return res.redirect('https://localhost:5173/seller?auth=error');
      }

      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('https://localhost:5173/seller?auth=failed');
        }

        return res.status(200).json({ success: true });
      });
    });
  }

  @UseGuards(SessionAuthGuard)
  @Get('profile')
  getProfile(@Req() req) {
    return req.user;
  }

  @UseGuards(SessionAuthGuard)
  @Post('logout')
  async logout(@Req() req) {
    return this.sellerAuthService.logout(req);
  }
}