import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocationService {
  constructor(private prisma: PrismaService) {}

  // The hubs a customer can choose at checkout
  async findAll() {
    return this.prisma.location.findMany({
      select: { id: true, name: true, address: true, coordinates: true, operatingHours: true, pickupFee: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
    });
    if (!location) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }
}
