import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { Admin, Customer, Seller } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private prisma: PrismaService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const roles = this.reflector.get<string[]>('roles', context.getHandler());
        if (!roles) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !user.id || !user.role) {
            throw new UnauthorizedException('Invalid token payload');
        }

        // Verify the role from database based on user type
        let dbUser: Customer | Seller | Admin;
        switch (user.role) {
            case 'CUSTOMER':
                dbUser = await this.prisma.customer.findUnique({
                    where: { id: user.sub }
                });
                break;
            case 'SELLER':
                dbUser = await this.prisma.seller.findUnique({
                    where: { id: user.id }
                });
                break;
            case 'ADMIN':
            case 'SUPER_ADMIN':
                dbUser = await this.prisma.admin.findUnique({
                    where: { id: user.sub }
                });
                break;
            default:
                throw new UnauthorizedException('Invalid user role');
        }

        if (!dbUser) {
            throw new UnauthorizedException('User not found');
        }

        // For admin, verify the actual role from database
        if ((user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && isAdmin(dbUser)) {
            if (dbUser.role !== user.role) {
                throw new UnauthorizedException('Invalid admin role');
            }
        }

        function isAdmin(user: Customer | Seller | Admin): user is Admin {
            return (user as Admin).role !== undefined;
        }

        return roles.includes(user.role);
    }
}
