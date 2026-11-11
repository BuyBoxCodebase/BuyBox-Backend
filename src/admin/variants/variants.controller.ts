import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { VariantApprovalStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser, Roles, RolesGuard } from '../../../libs/common/src';
import { AdminVariantsService } from './variants.service';

// RolesGuard only reads @Roles from the handler, so every route declares it itself.
@Controller('admin/variants')
export class AdminVariantsController {
  constructor(private readonly service: AdminVariantsService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get()
  list(
    @Query('status') status: string = VariantApprovalStatus.PENDING,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    const normalized = status.toUpperCase() as VariantApprovalStatus;
    if (!Object.values(VariantApprovalStatus).includes(normalized)) {
      throw new BadRequestException(`status must be one of: ${Object.values(VariantApprovalStatus).join(', ')}`);
    }
    return this.service.list(normalized, +page, +limit);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('/approve')
  approve(@GetUser('userId') adminId: string, @Body() body: { variantIds: string[] }) {
    return this.service.approve(adminId, body.variantIds);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('/reject')
  reject(@GetUser('userId') adminId: string, @Body() body: { variantIds: string[]; reason: string }) {
    return this.service.reject(adminId, body.variantIds, body.reason);
  }
}
