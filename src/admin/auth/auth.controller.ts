import { Request, Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AdminAuthService } from './auth.service';
import { JwtAuthGuard } from '../../customer/auth/guards/jwt-auth.guard';
import { GetUser, Roles, RolesGuard } from '../../../libs/common/src';
import { GoogleAdminAuthGuard } from 'src/customer/auth/guards/google-auth.guard';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
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
  async googleAuth() { }

  @UseGuards(GoogleAdminAuthGuard)
  @Get('google/callback')
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const { accessToken, refreshToken } = await this.adminAuthService.googleLogin(req.user);
    res.redirect(`http://admin.buyboxie.com/admin?accessToken=${accessToken}&refreshToken=${refreshToken}`);
  }
}
