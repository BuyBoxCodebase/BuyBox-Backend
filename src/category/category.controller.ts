import { BadRequestException, Body, Controller, Delete, Get, Patch, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { CategoryService } from './category.service';
import { Roles, RolesGuard } from '../../libs/common/src';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SessionAuthGuard } from '../../libs/shared/src';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) { }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("ADMIN", "SUPER_ADMIN")
  @Post("/upload/image")
  @UseInterceptors(FilesInterceptor('files', 1, {
    fileFilter(req, file, callback) {
      if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
        return callback(new BadRequestException('Only JPG, JPEG, and PNG files are allowed!'), false);
      }
      callback(null, true);
    },
  }))
  uploadProfileImages(@UploadedFiles() files: Array<Express.Multer.File>) {
    return this.categoryService.uploadProfileImage(files);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("ADMIN", "SUPER_ADMIN")
  @Post('/create')
  createCategory(@Body() body: { categoryName: string, imageUrl: string; priority?: number; }) {
    return this.categoryService.createCategory(body);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("ADMIN", "SUPER_ADMIN")
  @Post('/create/sub-category')
  createSubCategory(@Body() body: { categoryId: string, subCategoryName: string, imageUrl: string; priority?: number; }) {
    return this.categoryService.createSubCategory(body);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch('/update')
  updateCategory(@Body() body: { categoryId: string; categoryName: string, imageUrl: string; priority?: number; }) {
    return this.categoryService.updateCategory(body);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch('/update/sub-category')
  updateSubCategory(@Body() body: { subCategoryId: string; categoryId: string, subCategoryName: string, imageUrl: string; priority?: number; }) {
    return this.categoryService.updateSubCategory(body);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("ADMIN", "SUPER_ADMIN")
  @Delete('/delete')
  deleteCategory(@Body() body: { categoryId: string; }) {
    return this.categoryService.deleteCategory(body);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("ADMIN", "SUPER_ADMIN")
  @Delete('/delete/sub-category')
  deleteSubCategory(@Body() body: { subCategoryId: string; }) {
    return this.categoryService.deleteSubCategory(body);
  }

  @Get("/get")
  getCategories() {
    return this.categoryService.getCategories();
  }

  @Get("/get/sub-categories")
  getSubCategories() {
    return this.categoryService.getSubCategories();
  }
}
