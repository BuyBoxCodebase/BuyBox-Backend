import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SellerAnalyticsService {
    constructor(private prisma: PrismaService) { }

    async getTotalRevenue(sellerId: string, month: number, year: number) {
        const brand = await this.prisma.brand.findUnique({
            where: { userId: sellerId },
            select: { id: true },
        });

        if (!brand) {
            return {
                amount: 0,
                change: '0%',
            };
        }

        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);

        const prevStartDate = new Date(year, month - 1, 1);
        const prevEndDate = new Date(year, month, 0);

        const currentMonthOrders = await this.prisma.orderProduct.findMany({
            where: {
                product: {
                    brandId: brand.id,
                },
                order: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                    status: {
                        not: 'CANCELED',
                    },
                },
            },
            select: {
                totalPrice: true,
            },
        });

        const currentMonthRevenue = currentMonthOrders.reduce(
            (acc, order) => acc + order.totalPrice,
            0,
        );

        const prevMonthOrders = await this.prisma.orderProduct.findMany({
            where: {
                product: {
                    brandId: brand.id,
                },
                order: {
                    createdAt: {
                        gte: prevStartDate,
                        lte: prevEndDate,
                    },
                    status: {
                        not: 'CANCELED',
                    },
                },
            },
            select: {
                totalPrice: true,
            },
        });

        const prevMonthRevenue = prevMonthOrders.reduce(
            (acc, order) => acc + order.totalPrice,
            0,
        );

        const changePercentage = prevMonthRevenue === 0
            ? 100
            : ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100;

        return {
            amount: currentMonthRevenue.toFixed(2),
            change: `+${changePercentage.toFixed(1)}% from last month`,
        };
    }

    async getTotalSubscriptions(sellerId: string, month: number, year: number) {
        const brand = await this.prisma.brand.findUnique({
            where: { userId: sellerId },
            select: { id: true },
        });

        if (!brand) {
            return {
                count: 0,
                change: '0%',
            };
        }

        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);

        const prevStartDate = new Date(year, month - 1, 1);
        const prevEndDate = new Date(year, month, 0);

        const currentMonthCustomers = await this.prisma.order.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
                products: {
                    some: {
                        product: {
                            brandId: brand.id,
                        },
                    },
                },
            },
            select: {
                userId: true,
            },
            distinct: ['userId'],
        });

        const prevMonthCustomers = await this.prisma.order.findMany({
            where: {
                createdAt: {
                    gte: prevStartDate,
                    lte: prevEndDate,
                },
                products: {
                    some: {
                        product: {
                            brandId: brand.id,
                        },
                    },
                },
            },
            select: {
                userId: true,
            },
            distinct: ['userId'],
        });

        const currentCount = currentMonthCustomers.length;
        const prevCount = prevMonthCustomers.length;

        const changePercentage = prevCount === 0
            ? 100
            : ((currentCount - prevCount) / prevCount) * 100;

        return {
            count: currentCount,
            change: `+${changePercentage.toFixed(1)}% from last month`,
        };
    }

    async getTotalSales(sellerId: string, month: number, year: number) {
        const brand = await this.prisma.brand.findUnique({
            where: { userId: sellerId },
            select: { id: true },
        });

        if (!brand) {
            return {
                count: 0,
                change: '0%',
            };
        }

        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);

        const prevStartDate = new Date(year, month - 1, 1);
        const prevEndDate = new Date(year, month, 0);

        const currentMonthOrders = await this.prisma.order.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
                products: {
                    some: {
                        product: {
                            brandId: brand.id,
                        },
                    },
                },
            },
            select: {
                id: true,
            },
        });

        const prevMonthOrders = await this.prisma.order.findMany({
            where: {
                createdAt: {
                    gte: prevStartDate,
                    lte: prevEndDate,
                },
                products: {
                    some: {
                        product: {
                            brandId: brand.id,
                        },
                    },
                },
            },
            select: {
                id: true,
            },
        });

        const currentCount = currentMonthOrders.length;
        const prevCount = prevMonthOrders.length;

        const changePercentage = prevCount === 0
            ? 100
            : ((currentCount - prevCount) / prevCount) * 100;

        return {
            count: currentCount,
            change: `+${changePercentage.toFixed(1)}% from last month`,
        };
    }

    async getRecentSales(sellerId: string, month: number, year: number) {
        const brand = await this.prisma.brand.findUnique({
            where: { userId: sellerId },
            select: { id: true },
        });

        if (!brand) {
            return {
                totalSales: 0,
                customers: [],
            };
        }

        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);

        const orders = await this.prisma.order.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
                products: {
                    some: {
                        product: {
                            brandId: brand.id,
                        },
                    },
                },
            },
            select: {
                userId: true,
                user: {
                    select: {
                        name: true,
                        email: true,
                    },
                },
                products: {
                    where: {
                        product: {
                            brandId: brand.id,
                        },
                    },
                    select: {
                        totalPrice: true,
                    },
                },
            },
        });

        const customerMap = new Map();

        orders.forEach(order => {
            const userId = order.userId;
            const orderValue = order.products.reduce((sum, product) => sum + product.totalPrice, 0);

            if (customerMap.has(userId)) {
                customerMap.get(userId).totalPurchase += orderValue;
            } else {
                customerMap.set(userId, {
                    name: order.user.name,
                    email: order.user.email,
                    totalPurchase: orderValue,
                });
            }
        });

        const customersArray = Array.from(customerMap.entries()).map(([userId, data]) => ({
            userId,
            name: data.name,
            email: data.email,
            totalPurchase: data.totalPurchase,
        }));

        customersArray.sort((a, b) => b.totalPurchase - a.totalPurchase);

        const topCustomers = customersArray.slice(0, 5).map(customer => ({
            initials: customer.name.split(' ').map(name => name[0]).join(''),
            name: customer.name,
            email: customer.email,
            amount: `+$${customer.totalPurchase.toFixed(2)}`,
        }));

        return {
            totalSales: customersArray.length,
            customers: topCustomers,
        };
    }

    async getMonthlyData(sellerId: string, year: number) {
        const brand = await this.prisma.brand.findUnique({
            where: { userId: sellerId },
            select: { id: true },
        });

        if (!brand) {
            return [];
        }

        const monthlyData = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let month = 0; month < 12; month++) {
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);

            const orders = await this.prisma.orderProduct.findMany({
                where: {
                    product: {
                        brandId: brand.id,
                    },
                    order: {
                        createdAt: {
                            gte: startDate,
                            lte: endDate,
                        },
                        status: {
                            not: 'CANCELED',
                        },
                    },
                },
                select: {
                    totalPrice: true,
                },
            });

            const total = orders.reduce((sum, order) => sum + order.totalPrice, 0);

            monthlyData.push({
                name: monthNames[month],
                total,
            });
        }

        return monthlyData;
    }
}