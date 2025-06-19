import { Injectable } from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cloudinaryService: CloudinaryService
    ) { }

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
        return category;
    }

    async deleteCategory({ categoryId }: { categoryId: string; }) {
        const category = await this.prisma.category.delete({
            where: {
                id: categoryId,
            }
        });
        return category;
    }

    async deleteSubCategory({ subCategoryId }: { subCategoryId: string; }) {
        const category = await this.prisma.subCategory.delete({
            where: {
                id: subCategoryId,
            },
        });
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
