import { BadRequestException, Injectable } from '@nestjs/common';
import { CloudinaryService } from '../../src/cloudinary/cloudinary.service';
import { PrismaService } from '../../src/prisma/prisma.service';

@Injectable()
export class ReelsService {
    constructor(
        private readonly cloudinaryService: CloudinaryService,
        private readonly prisma: PrismaService,
    ) { }

    async uploadVideo(files: Array<Express.Multer.File>) {
        return (await this.cloudinaryService.uploadVideos(files));
    }

    async createReel(
        { productId, size, caption, videoUrl }
            : { productId: string, size: string, caption: string, videoUrl: string }
    ) {
        if ([productId, size, caption, videoUrl].some((value) => typeof value !== 'string' || !value)) {
            throw new BadRequestException('productId, size, caption and videoUrl are required');
        }
        const reel = await this.prisma.reel.create({
            data: {
                productId: productId,
                caption: caption,
                videoUrl: videoUrl,
                size: size
            }
        });

        return reel;
    }

    async getReels({ subcategory }: { subcategory: string }) {
        // ?subcategory[not]=x arrives as an object, and a malformed id makes Prisma throw P2023
        if (subcategory !== undefined && subcategory !== "" && (typeof subcategory !== "string" || !/^[a-f0-9]{24}$/i.test(subcategory))) {
            throw new BadRequestException("Invalid subcategory id");
        }
        const reels = await this.prisma.reel.findMany({
            where: subcategory ? { product: { subCategoryId: subcategory } } : {},
            include: {
                product: {
                    select: {
                        basePrice: true,
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        return reels;
    }

    async getReelsBySeller(sellerId: string) {
        // const reels = await this.prisma.reel.findMany({
        //     where: {
        //         product: {
        //             brand: {
        //                 userId: sellerId
        //             }
        //         }
        //     }
        // });
        /* This query is incorrect the business logic has changed consult the stake holder's before working on it*/
        return [];
    }
}
