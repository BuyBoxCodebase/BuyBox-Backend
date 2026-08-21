import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cloudinaryService: CloudinaryService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache
    ) { }

    private async invalidateCaches() {
        // Clear Redis cache (with try/catch for resilience)
        try {
            await this.cacheManager.del('categories');
            await this.cacheManager.del('sub-categories');
        } catch (e) {
            console.error("Failed to clear backend cache:", e);
        }
        
        // Ping Next.js frontend webhook to clear its cache
        try {
            const customerWebUrl = process.env.CUSTOMER_WEB_URL;
            const secret = process.env.REVALIDATION_SECRET;
            
            // fire and forget
            fetch(`${customerWebUrl}/api/revalidate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag: 'categories', secret })
            }).catch(error => {
                console.error("Failed to revalidate Next.js cache (async error)", error);
            });
        } catch (error) {
            console.error("Failed to revalidate Next.js cache", error);
        }
    }

    async uploadProfileImage(file: Array<Express.Multer.File>) {
        const images = (await this.cloudinaryService.uploadImages(file));
        const urls = images.map((image) => {
            return {
                publicId: image.public_id,
                url: image.url,
            };
        });
        return urls;
    }

    async createCategory({ categoryName, imageUrl, priority }: { categoryName: string; imageUrl: string; priority?: number; }) {
        const category = await this.prisma.category.create({
            data: {
                name: categoryName,
                imageUrl,
                ...(priority ? { priority } : {})
            }
        });
        await this.invalidateCaches();
        return category;
    }

    async createSubCategory({ categoryId, subCategoryName, imageUrl, priority }: { categoryId: string, subCategoryName: string; imageUrl: string; priority?: number; }) {
        const category = await this.prisma.subCategory.create({
            data: {
                name: subCategoryName,
                imageUrl,
                categoryId: categoryId,
                ...(priority ? { priority } : {})
            }
        });
        await this.invalidateCaches();
        return category;
    }

    async updateCategory({ categoryId, categoryName, imageUrl, priority }: { categoryId: string; categoryName: string; imageUrl: string; priority?: number; }) {
        const category = await this.prisma.category.update({
            where: {
                id: categoryId,
            },
            data: {
                name: categoryName,
                imageUrl,
                ...(priority ? { priority } : {})
            }
        });
        await this.invalidateCaches();
        return category;
    }

    async updateSubCategory({ subCategoryId, categoryId, subCategoryName, imageUrl, priority }: { subCategoryId: string; categoryId: string, subCategoryName: string; imageUrl: string; priority?: number; }) {
        const category = await this.prisma.subCategory.update({
            where: {
                id: subCategoryId,
            },
            data: {
                name: subCategoryName,
                imageUrl,
                categoryId: categoryId,
                ...(priority ? { priority } : {})
            }
        });
        await this.invalidateCaches();
        return category;
    }

    async deleteCategory({ categoryId }: { categoryId: string; }) {
        const category = await this.prisma.category.delete({
            where: {
                id: categoryId,
            }
        });
        await this.invalidateCaches();
        return category;
    }

    async deleteSubCategory({ subCategoryId }: { subCategoryId: string; }) {
        const category = await this.prisma.subCategory.delete({
            where: {
                id: subCategoryId,
            },
        });
        await this.invalidateCaches();
        return category;
    }

    async getCategories() {
        const categories = await this.prisma.category.findMany({
            include: {
                subCategories: true
            },
            orderBy: {
                priority: 'desc'
            }
        });
        return categories;
    }

    async getSubCategories() {
        const categories = await this.prisma.subCategory.findMany({
            include: {
                category: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                priority: 'desc'
            }
        });
        return categories;
    }
}
