import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  BadRequestException,
  UploadedFiles,
} from '@nestjs/common';
import { AdsService } from './ads.service';
import { AdMetricsService } from './ads-metrics.service';
import { CreateAdvertisementDto } from './dto/create-ad.dto';
import { UpdateAdvertisementDto } from './dto/update-ad.dto';
import { AdQueryDto } from './dto/ad-query.dto';
import { LogAdInteractionDto } from './dto/log-ad-interaction.dto';
import { AdStatus, AdPlacement } from '@prisma/client';
import { JwtAuthGuard } from 'src/admin/auth/guards/jwt-auth.guard';
import { GetUser, Roles, RolesGuard } from '../../libs/common/src';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('ads')
export class AdsController {
  constructor(
    private readonly adsService: AdsService,
    private readonly adMetricsService: AdMetricsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('upload/images')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
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
  uploadAdImages(@UploadedFiles() files: Array<Express.Multer.File>) {
    return this.adsService.uploadAdMedia(files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('create')
  create(
    @GetUser('userId') userId: string,
    @Body() createAdvertisementDto: CreateAdvertisementDto,
  ) {
    return this.adsService.create(createAdvertisementDto, userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('get')
  findAll(@Query() query: AdQueryDto) {
    return this.adsService.findAll(query);
  }

  @Get('active/:placement')
  findActive(
    @Param('placement') placement: string,
    @Query('userId') userId?: string,
    @Query() userContext?: any,
  ) {
    // Convert string to enum value
    const placementEnum = placement as AdPlacement;
    return this.adsService.findActive(placementEnum, userId, userContext);
  }

  @Get('dynamic/:placement')
  getDynamicAds(
    @Param('placement') placement: string,
    @Query('count') count: number = 3,
    @Query('userId') userId?: string,
    @Query() context?: any,
  ) {
    return this.adsService.getDynamicAds(placement, +count, userId, context);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateAdvertisementDto: UpdateAdvertisementDto,
  ) {
    return this.adsService.update(id, updateAdvertisementDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: AdStatus) {
    return this.adsService.updateStatus(id, status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adsService.remove(id);
  }

  @Post('interaction')
  logInteraction(@Body() logData: LogAdInteractionDto) {
    return this.adsService.logInteraction(logData);
  }

  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles("ADMIN")
  // @Get(':id/metrics')
  // getMetrics(
  //   @Param('id') id: string,
  //   @Query('startDate') startDate: Date,
  //   @Query('endDate') endDate: Date,
  // ) {
  //   return this.adMetricsService.getMetricsByDateRange(id, startDate, endDate);
  // }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get(':id/performance')
  getPerformance(@Param('id') id: string) {
    return this.adMetricsService.getPerformanceSummary(id);
  }
}
