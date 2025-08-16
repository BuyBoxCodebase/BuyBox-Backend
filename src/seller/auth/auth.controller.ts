import { BadRequestException, Body, Controller, Get, Post, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { SellerAuthService } from './auth.service';
import { GoogleSellerAuthGuard } from './guards/google-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('seller/auth')
export class SellerAuthController {
  constructor(private readonly sellerAuthService: SellerAuthService) { }

  @Post("/upload/images")
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
  async sellerRegister(@Body() body: { name: string; email: string; password: string; phoneNumber: string; }) {
    return this.sellerAuthService.registerSeller(body.email, body.password, body.name, body.phoneNumber);
  }

  @Post('verify')
  async verifySeller(@Body() body: { activationToken: string; activationCode: string; }) {
    return this.sellerAuthService.verifySeller(body.activationToken, body.activationCode);
  }

  @Post('login')
  async sellerLogin(@Body() body: { email: string; password: string; }) {
    return this.sellerAuthService.loginSeller(body.email, body.password);
  }

  @UseGuards(GoogleSellerAuthGuard)
  @Get('google')
  async googleAuthSeller() { }

  @UseGuards(GoogleSellerAuthGuard)
  @Get('google/callback')
  async googleAuthCallbackSeller(@Req() req, @Res() res) {
    const { token } = await this.sellerAuthService.sellerGoogleLogin(req.user);
    res.redirect(`http://localhost:5173/seller?token=${token}`);
  }
}
