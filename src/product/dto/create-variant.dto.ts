export class CreateVariantDto {
    name: string;
    description: string;
    price: string;
    stockQuantity?: number;
    isDefault?: boolean;
    images?: string[];
    optionValueIds?: string[];
}