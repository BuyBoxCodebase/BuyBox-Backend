import { Injectable } from '@nestjs/common';
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

    async getReels() {
        const reels = await this.prisma.reel.findMany({
            include: {
                product: {
                    select: {
                        basePrice: true,
                    }
                }
            }
        });
        return reels;
    }

    async getReelsBySeller(sellerId: string) {
        const reels = await this.prisma.reel.findMany({
            where: {
                product: {
                    brand: {
                        userId: sellerId
                    }
                }
            }
        });
        return reels;
    }
}
