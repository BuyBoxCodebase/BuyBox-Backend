import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isValidCoordinates, PricingError, quoteDelivery, validateConfig } from './pricing';
import { Coordinates, DeliveryQuote, FulfillmentMethod, Hub, PricingConfig } from './delivery-pricing.types';

export interface QuoteRequest {
  productIds: string[];
  method: FulfillmentMethod;
  hubId: string;
  customerCoordinates?: Coordinates;
}

@Injectable()
export class DeliveryPricingService {
  constructor(private readonly prisma: PrismaService) {}

  // Prices are always worked out here from stored data, never taken from the client.
  async quote(request: QuoteRequest): Promise<DeliveryQuote> {
    if (request.method !== 'PICKUP' && request.method !== 'DELIVERY') {
      throw new BadRequestException('Choose pickup or home delivery');
    }
    if (!request.hubId) {
      throw new BadRequestException('Choose a hub');
    }

    const [hubs, config, sellerCoordinates] = await Promise.all([
      this.getHubs(),
      this.getConfig(),
      this.getSellerCoordinates(request.productIds),
    ]);

    try {
      return quoteDelivery(
        {
          method: request.method,
          hubId: request.hubId,
          customerCoordinates: request.customerCoordinates,
          sellerCoordinates,
        },
        hubs,
        config,
      );
    } catch (error) {
      if (error instanceof PricingError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // Hubs without valid coordinates cannot be priced, so they are left out.
  async getHubs(): Promise<Hub[]> {
    const locations = await this.prisma.location.findMany({ orderBy: { name: 'asc' } });
    return locations
      .filter((location) => isValidCoordinates(location.coordinates))
      .map((location) => ({
        id: location.id,
        name: location.name,
        coordinates: location.coordinates as unknown as Coordinates,
        handlingFee: location.pickupFee,
      }));
  }

  async getConfig(): Promise<PricingConfig> {
    const config = await this.prisma.deliveryConfig.findFirst();
    if (!config) {
      throw new InternalServerErrorException('Delivery pricing has not been set up');
    }
    return {
      transferFees: config.transferFees as unknown as PricingConfig['transferFees'],
      distanceBands: config.distanceBands as unknown as PricingConfig['distanceBands'],
      beyondLastBandFee: config.beyondLastBandFee,
    };
  }

  async getAdminSettings() {
    const [locations, config] = await Promise.all([
      this.prisma.location.findMany({
        select: { id: true, name: true, address: true, coordinates: true, pickupFee: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.deliveryConfig.findFirst(),
    ]);

    return {
      hubs: locations.map(({ pickupFee, ...hub }) => ({ ...hub, handlingFee: pickupFee })),
      config: config
        ? {
            transferFees: config.transferFees,
            distanceBands: config.distanceBands,
            beyondLastBandFee: config.beyondLastBandFee,
          }
        : null,
    };
  }

  async updateConfig(config: PricingConfig) {
    const hubs = await this.getHubs();
    const problems = validateConfig(config, hubs.map((hub) => hub.id));
    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }

    const data = {
      transferFees: config.transferFees.map(({ hubAId, hubBId, fee }) => ({ hubAId, hubBId, fee })),
      distanceBands: config.distanceBands.map(({ maxKm, fee }) => ({ maxKm, fee })),
      beyondLastBandFee: config.beyondLastBandFee,
    };

    const existing = await this.prisma.deliveryConfig.findFirst({ select: { id: true } });
    if (existing) {
      await this.prisma.deliveryConfig.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.deliveryConfig.create({ data });
    }
    return this.getAdminSettings();
  }

  async updateHub(hubId: string, data: { handlingFee?: number; coordinates?: Coordinates }) {
    const hub = await this.prisma.location.findUnique({ where: { id: hubId }, select: { id: true } });
    if (!hub) {
      throw new NotFoundException('Hub not found');
    }
    if (data.handlingFee !== undefined && (typeof data.handlingFee !== 'number' || data.handlingFee < 0)) {
      throw new BadRequestException('Handling fee must be 0 or more');
    }
    if (data.coordinates !== undefined && !isValidCoordinates(data.coordinates)) {
      throw new BadRequestException('Coordinates must have a valid latitude and longitude');
    }

    await this.prisma.location.update({
      where: { id: hubId },
      data: {
        ...(data.handlingFee !== undefined && { pickupFee: data.handlingFee }),
        ...(data.coordinates !== undefined && {
          coordinates: { latitude: data.coordinates.latitude, longitude: data.coordinates.longitude },
        }),
      },
    });
    return this.getAdminSettings();
  }

  // One entry per distinct seller; null for sellers who have not set a location.
  private async getSellerCoordinates(productIds: string[]): Promise<(Coordinates | null)[]> {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new BadRequestException('The order has no products');
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...new Set(productIds)] } },
      select: { sellerId: true, seller: { select: { coordinates: true } } },
    });

    const bySeller = new Map<string, Coordinates | null>();
    for (const product of products) {
      const coordinates = product.seller?.coordinates;
      bySeller.set(product.sellerId, isValidCoordinates(coordinates) ? coordinates : null);
    }
    return [...bySeller.values()];
  }
}
