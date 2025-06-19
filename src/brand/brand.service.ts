import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CloudinaryService } from '../../src/cloudinary/cloudinary.service';

@Injectable()
export class BrandService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) { }

  async uploadBrandImage(file: Array<Express.Multer.File>) {
    const images = (await this.cloudinaryService.uploadImages(file));
    const urls = images.map((image) => {
      return {
        publicId: image.public_id,
        url: image.url,
      };
    });
    return urls;
  }

  async createBrand(userId: string, createBrandDto: CreateBrandDto) {
    const {
      name,
      description,
      // brandPic,
      location
    } = createBrandDto;

    const transaction = this.prisma.$transaction(async (prisma) => {
      const existsBrand = await prisma.brand.findUnique({
        where: {
          userId: userId
        }
      });

      if (existsBrand) {
        throw new BadRequestException("You have already made an brand");
      }

      const newBrand = await prisma.brand.create({
        data: {
          name: name,
          description: description || "",
          // brandPic: brandPic,
          location: location,
          userId: userId
        }
      });

      const updatedUser = await prisma.seller.update({
        where: {
          id: userId,
        },
        data: {
          isCompleted: true,
        }
      })

      if (!newBrand || !updatedUser) {
        return {
          success: false,
          message: "Failed to create brand"
        };
      }

      return {
        success: true,
        message: "Brand created successfully",
        newBrand
      };
    });
    return transaction;
  }

  async getAllBrand() {
    const brands = await this.prisma.brand.findMany();
    return brands;
  }

  async getBrand(brandId: string) {
    const brand = await this.prisma.brand.findUnique({
      where: {
        id: brandId
      }
    });

    return {
      success: true,
      message: "Brand fetched",
      brand
    };
  }

  async getMyBrand(userId: string) {
    const brand = await this.prisma.brand.findUnique({
      where: {
        userId: userId
      }
    });

    if (!brand) {
      return {
        success: false,
        message: "No Brand exists"
      }
    }

    return {
      success: true,
      message: "Brand fetched",
      brand,
    };
  }

  async updateBrand(userId: string, updateBrandDto: UpdateBrandDto) {
    const {
      name,
      brandId,
      brandPic,
      description,
      location,
    } = updateBrandDto;

    const existsBrand = await this.prisma.brand.findUnique({
      where: {
        id: brandId,
        userId: userId
      }
    });

    if (!existsBrand) {
      throw new BadRequestException("You can't update this brand's profile");
    }

    const updatedBrand = await this.prisma.brand.update({
      where: {
        id: brandId,
      },
      data: {
        name: name,
        description: description,
        brandPic: brandPic,
        location: location,
      }
    });

    if (!updatedBrand) {
      return {
        success: false,
        message: "Failed to update brand"
      };
    }

    return {
      success: true,
      message: "Brand updated successfully"
    };
  }

  async deleteBrand(userId: string, brandId: string) {
    const existsBrand = await this.prisma.brand.delete({
      where: {
        id: brandId,
        userId: userId,
      }
    });

    if (!existsBrand) {
      throw new BadRequestException("Failed to delete brand");
    }
    return this.prisma.$transaction(async (prisma) => {
      await prisma.brand.delete({
        where: {
          id: brandId,
          userId: userId
        }
      });

      if (!existsBrand) {
        throw new Error("Failed to delete brand");
      }

      await prisma.seller.update({
        where: {
          id: userId
        },
        data: {
          isCompleted: false,
        }
      });

      return {
        success: true,
        message: "Brand deleted successfully"
      }
    });
  }
}
