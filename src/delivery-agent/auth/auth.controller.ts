import { BadRequestException, Body, Controller, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { DeliveryAgentAuthService } from './auth.service';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('delivery/auth')
export class DeliveryAgentAuthController {
  constructor(private readonly deliveryAgentAuthService: DeliveryAgentAuthService) { }

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
    return this.deliveryAgentAuthService.uploadProfileImage(files);
  }

  @Post('register')
  async deliveryAgentRegister(@Body() body: { email: string; password: string; name: string; phoneNumber: string }) {
    return this.deliveryAgentAuthService.registerDeliveryAgent(body.email, body.password, body.name, body.phoneNumber);
  }

  @Post('verify')
  async verifyDeliveryAgent(@Body() body: { activationToken: string; activationCode: string; }) {
    return this.deliveryAgentAuthService.verifyDeliveryAgent(body.activationToken, body.activationCode);
  }

  @Post('login')
  async loginDeliveryAgent(@Body() body: { email: string; password: string; }) {
    return this.deliveryAgentAuthService.loginDeliveryAgent(body.email, body.password);
  }

  @Post('google/mobile')
  async googleMobileAuthDeliveryAgent(@Body() body: { idToken: string }) {
    return this.deliveryAgentAuthService.verifyGoogleIdTokenDeliveryAgent(body.idToken);
  }
}
