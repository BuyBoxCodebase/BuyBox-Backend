import { BadRequestException, Body, Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ReelsService } from './reels.service';
import { RolesGuard, Roles } from '../../libs/common/src';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../src/seller/auth/guards/jwt-auth.guard';

@Controller('reels')
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @UseInterceptors(FilesInterceptor('files', 1, {
    fileFilter(req, file, callback) {
      if (!file.mimetype.match(/\/(mp4)$/)) {
        return callback(new BadRequestException('Only MP4 files are allowed!'), false);
      }
      callback(null, true);
    },
  }))
  @Post("/upload/images")
  uploadProductImages(@UploadedFiles() files: Array<Express.Multer.File>) {
    return this.reelsService.uploadVideo(files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post('/create')
  createProduct(@Body() body: any) {
    return this.reelsService.createReel(body);
  }
}
