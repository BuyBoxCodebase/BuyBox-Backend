import { Body, Controller, Get, Param, Post, Query, UseGuards, } from '@nestjs/common';
import { AdminControlService } from './control.service';
import { Roles, RolesGuard } from '../../../libs/common/src';
import { SessionAuthGuard } from '../../../libs/shared/src';

@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('admin/control')
export class AdminControlController {
    constructor(private readonly adminControlService: AdminControlService) { }

    @Roles("SUPER_ADMIN")
    @Get('/get/admins')
    getAdmins() {
        return this.adminControlService.getAllAdmins();
    }

    @Roles("ADMIN", "SUPER_ADMIN")
    @Get('/get/sellers')
    getSellers(@Query('page') page = 1, @Query('limit') limit = 10) {
        return this.adminControlService.getAllSellers(+page, +limit);
    }

    @Roles("ADMIN", "SUPER_ADMIN")
    @Get('/get/customers')
    getCustomers(@Query('page') page = 1, @Query('limit') limit = 10) {
        return this.adminControlService.getAllCustomers(+page, +limit);
    }

    @Roles("ADMIN", "SUPER_ADMIN")
    @Get('/get/delivery-agents')
    getDeliveryAgents(@Query('page') page = 1, @Query('limit') limit = 10) {
        return this.adminControlService.getAllDeliveryAgents(+page, +limit);
    }

    @Roles("ADMIN", "SUPER_ADMIN")
    @Get('/get/orders')
    getOrders(@Query('page') page = 1, @Query('limit') limit = 10) {
        return this.adminControlService.getAllOrders(+page, +limit);
    }

    @Roles("ADMIN", "SUPER_ADMIN")
    @Post('/order/assign')
    async assignOrder(@Body() body: { deliveryAgentId: string, orderId: string }) {
        return this.adminControlService.assignOrderToDeliveryAgent(body.orderId, body.deliveryAgentId);
    }

    @Roles("SUPER_ADMIN")
    @Post('/grant/admin/:userId')
    grantAdmin(@Param('userId') userId: string) {
        return this.adminControlService.grantAdmin(userId);
    }

    @Roles("SUPER_ADMIN")
    @Post('/revoke/admin/:userId')
    revokeAdmin(@Param('userId') userId: string) {
        return this.adminControlService.revokeAdmin(userId);
    }
}
