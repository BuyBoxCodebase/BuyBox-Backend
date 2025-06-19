import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminAnalyticsService {
    constructor(private prisma: PrismaService) { }

    async getAllCustomers({ cursor, limit = 10 }) {
        const take = limit + 1;

        const customers = await this.prisma.customer.findMany({
            take,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                name: true,
                email: true,
                username: true,
                profilePic: true,
                phoneNumber: true,
                interests: true,
                isCompleted: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        const hasNextPage = customers.length > limit;

        if (hasNextPage) {
            customers.pop();
        }

        const nextCursor = hasNextPage ? customers[customers.length - 1]?.id : null;

        return {
            customers,
            pagination: {
                hasNextPage,
                nextCursor,
            },
        };
    }
}