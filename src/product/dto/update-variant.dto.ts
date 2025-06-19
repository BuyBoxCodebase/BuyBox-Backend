export class UpdateVariantDto {
    name?: string;
    description?: string;
    price?: string;
    stockQuantity?: number;
    isDefault?: boolean;
    images?: string[];
    optionValueIds?: string[];
}