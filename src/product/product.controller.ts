import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFiles, BadRequestException, UseGuards, Query } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { Roles, RolesGuard } from '../../libs/common/src';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { SessionAuthGuard } from '../../libs/shared/src';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) { }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("SELLER")
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
    return this.productService.uploadFiles(files);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post('/create')
  createProduct(@GetUser('userId') userId: string, @Body() body: CreateProductDto) {
    return this.productService.createProduct(userId, body);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post('/create/variant/:productId')
  async createVariant(
    @GetUser('userId') userId: string,
    @Param('productId') productId: string,
    @Body() createVariantDto: CreateVariantDto
  ) {
    return await this.productService.createVariant(userId, productId, createVariantDto);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
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

  @UseGuards(SessionAuthGuard, RolesGuard)
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

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Patch('/update/:id')
  updateProduct(@Param('id') id: string, @GetUser('userId') userId: string, @Body() body: CreateProductDto) {
    return this.productService.updateProduct(userId, {
      ...body,
      productId: id
    });
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Patch('/update/variant/:variantId')
  async updateVariant(
    @GetUser('userId') userId: string,
    @Param('variantId') variantId: string,
    @Body() updateVariantDto: UpdateVariantDto
  ) {
    return await this.productService.updateVariant(userId, variantId, updateVariantDto);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Delete('/delete/:id')
  deleteProduct(@GetUser("userId") userId: string, @Param('id') id: string) {
    return this.productService.deleteProduct(userId, id);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Delete('/delete/variant/:variantId')
  async deleteVariant(
    @GetUser("userId") userId: string,
    @Param('variantId') variantId: string
  ) {
    return await this.productService.deleteVariant(userId, variantId);
  }

  // @Get('search')
  // async searchProducts(@Query() query: Record<string, string>) {
  //   // Remove any pagination or sorting parameters
  //   const { page, limit, sort, order, ...attributeFilters } = query;

  //   return this.productService.findProductsByAttributes(attributeFilters);
  // }

  // @Get('full-search')
  // async search(
  //   @Query('q') searchTerm: string,
  //   @Query('page') page?: number,
  //   @Query('limit') limit?: number,
  //   @Query('sort') sort?: string,
  //   @Query('category') categoryId?: string,
  //   @Query('subcategory') subCategoryId?: string,
  //   @Query('brand') brandId?: string,
  //   @Query('minPrice') minPrice?: string,
  //   @Query('maxPrice') maxPrice?: string,
  //   @Query() query?: Record<string, string | string[]>
  // ) {
  //   // Extract attribute filters - any query params that aren't specifically handled
  //   const reservedParams = [
  //     'q', 'page', 'limit', 'sort', 'category',
  //     'subcategory', 'brand', 'minPrice', 'maxPrice'
  //   ];

  //   const attributeFilters = Object.entries(query || {})
  //     .filter(([key]) => !reservedParams.includes(key))
  //     .reduce((acc, [key, value]) => {
  //       acc[key] = value;
  //       return acc;
  //     }, {});

  //   return this.productService.fullTextSearch(searchTerm, {
  //     page: page ? parseInt(page.toString()) : 1,
  //     limit: limit ? parseInt(limit.toString()) : 20,
  //     sort: sort as any,
  //     filters: {
  //       categoryId,
  //       subCategoryId,
  //       brandId,
  //       minPrice,
  //       maxPrice,
  //       // attributes: attributeFilters
  //     }
  //   });
  // }

  // // Combined search endpoint that includes both text search and attribute filtering
  // @Get('combined-search')
  // async combinedSearch(
  //   @Query('q') searchTerm?: string,
  //   @Query() query?: Record<string, string | string[]>
  // ) {
  //   // Extract pagination and sorting
  //   const { page, limit, sort, ...rest } = query || {};

  //   // Extract standard filters
  //   const {
  //     category: categoryId,
  //     subcategory: subCategoryId,
  //     brand: brandId,
  //     minPrice,
  //     maxPrice,
  //     ...attributeFilters
  //   } = rest;

  //   return this.productService.fullTextSearch(searchTerm, {
  //     page: page ? parseInt(page.toString()) : 1,
  //     limit: limit ? parseInt(limit.toString()) : 20,
  //     sort: sort as any,
  //     filters: {
  //       categoryId: categoryId as string,
  //       subCategoryId: subCategoryId as string,
  //       brandId: brandId as string,
  //       minPrice: minPrice as string,
  //       maxPrice: maxPrice as string,
  //       // attributes: attributeFilters
  //     }
  //   });
  // }
}
