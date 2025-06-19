import { AdType, AdPlacement, AdStatus, AdTargetType } from '@prisma/client';

export class AdQueryDto {
    type?: AdType;
    placement?: AdPlacement;
    status?: AdStatus;
    targetType?: AdTargetType;
    activeFrom?: Date;
    activeTo?: Date;
    productId?: string;
    categoryId?: string;
    brandId?: string;
    isAbTest?: boolean;
}
