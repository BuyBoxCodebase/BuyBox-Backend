import { AdType, AdPlacement, AdStatus, AdTargetType } from '@prisma/client';

export class CreateAdvertisementDto {
    title: string;
    description?: string;
    type: AdType;
    placement: AdPlacement;
    content: Record<string, any>;
    targetType: AdTargetType;
    targetConfig?: Record<string, any>;
    status: AdStatus;
    startDate: Date;
    endDate?: Date;
    priority?: number;
    maxImpressions?: number;
    maxClicks?: number;
    budget?: number;
    productId?: string;
    categoryId?: string;
    brandId?: string;
    mediaUrls: string[];
    scheduleConfig?: Record<string, any>;
    displayConditions?: Record<string, any>;
    isAbTest?: boolean;
    abTestGroup?: string;
}