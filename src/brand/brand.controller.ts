import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, BadRequestException, UploadedFiles, UseGuards } from '@nestjs/common';
import { BrandService } from './brand.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { Roles, RolesGuard } from '../../libs/common/src';

@Controller('brand')
export class BrandController {
  constructor(private readonly brandService: BrandService) { }

  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles("SELLER")
  @UseInterceptors(FilesInterceptor('files', 5, {
    fileFilter(req, file, callback) {
      if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
        return callback(new BadRequestException('Only JPG, JPEG, and PNG files are allowed!'), false);
      }
      callback(null, true);
    },
  }))
  @Post("/upload/images")
  uploadProductImages(@UploadedFiles() files: Array<Express.Multer.File>) {
    return this.brandService.uploadBrandImage(files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post('/create')
  createBrand(@GetUser("userId") userId: string, @Body() createBrandDto: CreateBrandDto) {
    return this.brandService.createBrand(userId, createBrandDto);
  }

  @Get('/get-all-brands')
  getAllBrands() {
    return this.brandService.getAllBrand();
  }

  @Get("/get-brand/:id")
  getBrand(@Param('id') brandId: string) {
    return this.brandService.getBrand(brandId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get('/get-my-brand')
  findOne(@GetUser("userId") userId: string) {
    return this.brandService.getMyBrand(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Patch('/update-brand/:id')
  updateBrand(@GetUser() userId: string, @Param('id') id: string, @Body() updateBrandDto: CreateBrandDto) {
    return this.brandService.updateBrand(userId, {
      ...updateBrandDto,
      brandId: id
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Delete('/delete-brand/:id')
  deleteBrand(@GetUser("userId") userId: string, @Param('id') id: string) {
    return this.brandService.deleteBrand(userId, id);
  }
}
