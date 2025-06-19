import { BadRequestException, Body, Controller, Get, Patch, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { CustomerProfileService } from './profile.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SessionAuthGuard } from '@app/shared';

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

  @UseGuards(SessionAuthGuard)
  @Get('get-details')
  async getCustomerDetails(@Req() req) {
    return this.customerProfileService.getCustomerDetails(req.user.userId);
  }

  @UseGuards(SessionAuthGuard)
  @Patch("update-profile")
  async updateCustomer(@Req() req, @Body() body) {
    return this.customerProfileService.updateCustomerDetails(req.user.userId, body);
  }
}
