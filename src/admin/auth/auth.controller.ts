import { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AdminAuthService } from './auth.service';
import { Roles, RolesGuard } from '../../../libs/common/src';
import { GoogleAdminAuthGuard } from './guards/google-auth.guard';
import { SessionAuthGuard } from '../../../libs/shared/src';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('/upload/image')
  @UseInterceptors(
    FilesInterceptor('files', 1, {
      fileFilter(req, file, callback) {
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return callback(
            new BadRequestException(
              'Only JPG, JPEG, and PNG files are allowed!',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  uploadProfileImages(@UploadedFiles() files: Array<Express.Multer.File>) {
    return this.adminAuthService.uploadProfileImage(files);
  }

  @UseGuards(GoogleAdminAuthGuard)
  @Get('google')
  async googleAuth() {}

  @UseGuards(GoogleAdminAuthGuard)
  @Get('google/callback')
  async googleAuthCallback(@Req() req, @Res() res: Response) {
    if (req.user.twoFactorEnabled) {
      req.session.googleAuthPending = true;
      req.session.googleAuthUser = req.user;

      // Redirect to 2FA page
      return res.redirect('https://localhost:5173/admin/2fa-verification');
    }
    // Manually log the user in
    req.login(req.user, (err) => {
      if (err) {
        console.error('Login error:', err);
        return res.redirect('http://localhost:5173/admin?auth=error');
      }

      console.log('User logged in, session:', req.session);

      // Force session save
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('http://localhost:5173/admin?auth=failed');
        }

        if (!req.user.isCompleted) {
          return res.redirect('http://localhost:5173/admin?auth=pending');
        }

        return res.redirect('http://localhost:5173/admin?auth=success');
      });
    });
  }

  @UseGuards(SessionAuthGuard)
  @Post('logout')
  async logout(@Req() req) {
    return this.adminAuthService.logout(req);
  }
}
