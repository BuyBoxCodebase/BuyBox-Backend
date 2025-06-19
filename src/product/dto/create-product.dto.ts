class ProductOptionDto {
    name: string;
    values: string[];
}

class DefaultVariantDto {
    price: string;
    stockQuantity?: number;
    images?: string[];
    optionValues?: string[];
}

export class CreateProductDto {
    name: string;
    description: string;
    categoryId: string;
    subCategoryId: string;
    basePrice: string;
    images: string[];
    inventory: string;
    options?: ProductOptionDto[];
    defaultVariant?: DefaultVariantDto;
}