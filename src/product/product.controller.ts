import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFiles, BadRequestException, UseGuards, Query } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../../libs/common/src';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @UseInterceptors(FilesInterceptor('files', 5, {
    fileFilter(req, file, callback) {
      if (!file.mimetype.startsWith('image/')) {
        return callback(new BadRequestException('Only image files are allowed!'), false);
      }
      callback(null, true);
    },
  }))
  @Post("/upload/images")
  uploadProductImages(@UploadedFiles() files: Array<Express.Multer.File>) {
    return this.productService.uploadFiles(files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post('/create')
  createProduct(@GetUser('userId') userId: string, @Body() body: CreateProductDto) {
    return this.productService.createProduct(userId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post('/create/variant/:productId')
  async createVariant(
    @GetUser('userId') userId: string,
    @Param('productId') productId: string,
    @Body() createVariantDto: CreateVariantDto
  ) {
    return await this.productService.createVariant(userId, productId, createVariantDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post('/add/variant-options')
  async addVariants(
    @GetUser('userId') userId: string,
    @Body() createVariantOptionsDto: any
  ) {
    return this.productService.addProductOptionValues(createVariantOptionsDto);
  }

  @Get('/get-all-product')
  getProducts(@Query('category') category: string) {
    return this.productService.getProducts({ categoryId: category });
  }

  @Get('/get-by-subcategory')
  getProductsBySubcategory(
    @Query('categoryId') categoryId: string,
    @Query('subCategoryName') subCategoryName: string,
  ) {
    return this.productService.getProductsBySubcategory(categoryId, subCategoryName);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("/get-seller-products")
  getSellerProducts(@GetUser("userId") userId: string) {
    return this.productService.getSellerProducts(userId);
  }

  @Get('/get-product/:id')
  getSingleProduct(@Param('id') id: string) {
    return this.productService.getSingleProduct(id);
  }

  @Get('/variant/:variantId')
  async getProductVariantById(@Param('variantId') variantId: string) {
    return await this.productService.getProductVariantById(variantId);
  }

  @Get('/variants/:id')
  async getProductVariants(
    @Param('id') id: string,
    @Query() optionFilters: Record<string, string>
  ) {
    return await this.productService.getProductVariants(id, optionFilters);
  }

  @Get('/option/:id')
  getProductOptionValues(@Param('id') productId: string) {
    return this.productService.getOptionValues(productId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Patch('/update/:id')
  updateProduct(@Param('id') id: string, @GetUser('userId') userId: string, @Body() body: CreateProductDto) {
    return this.productService.updateProduct(userId, {
      ...body,
      productId: id
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Patch('/update/variant/:variantId')
  async updateVariant(
    @GetUser('userId') userId: string,
    @Param('variantId') variantId: string,
    @Body() updateVariantDto: UpdateVariantDto
  ) {
    return await this.productService.updateVariant(userId, variantId, updateVariantDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Delete('/delete')
  deleteAllProduct(@GetUser("userId") userId: string) {
    return this.productService.deleteAllProduct(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Delete('/delete/:id')
  deleteProduct(@GetUser("userId") userId: string, @Param('id') id: string) {
    return this.productService.deleteProduct(userId, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Delete('/delete/variant/:variantId')
  async deleteVariant(
    @GetUser("userId") userId: string,
    @Param('variantId') variantId: string
  ) {
    return await this.productService.deleteVariant(userId, variantId);
  }

  @Get('/popular')
  getPopularProducts(
    @Query('categoryId') categoryId?: string,
    @Query('limit') limit: number = 20,
    @Query('customerId') customerId?: string
  ) {
    return this.productService.getPopularForCustomer(customerId || null, categoryId, Number(limit));
  }
}
