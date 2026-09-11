import { BadRequestException, Body, Controller, Get, Patch, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { CustomerProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('customer/profile')
export class CustomerProfileController {
  constructor(private readonly customerProfileService: CustomerProfileService) { }

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
    return this.customerProfileService.uploadProfileImage(files);
  }

  @UseGuards(JwtAuthGuard)
  @Get('get-details')
  async getCustomerDetails(@Req() req) {
    return this.customerProfileService.getCustomerDetails(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("update-profile")
  async updateCustomer(@Req() req, @Body() body) {
    return this.customerProfileService.updateCustomerDetails(req.user.userId, body);
  }
}
