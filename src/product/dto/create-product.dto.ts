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

class GeneratedVariantOptionDto {
    optionName: string;
    value: string;
}

export const PRODUCT_GENDERS = ['male', 'female', 'unisex'] as const;
export type ProductGender = (typeof PRODUCT_GENDERS)[number];
export const MIN_DESCRIPTION_LENGTH = 100;

class GeneratedVariantDto {
    name: string;
    price: number;
    inventory: number;
    options: GeneratedVariantOptionDto[];
    image?: string;
}

// Optional, storage-only product details. Not used for search or tags.
export class ProductAttributesDto {
    model_generation?: string;
    style_code?: string;
    sizing_system?: string;
    use_case?: {
        primary_activity?: string;
        terrain?: string;
        arch_support?: string;
        cushioning_level?: string;
    };
    materials?: {
        upper?: string;
        sole?: string;
        midsole_tech?: string;
    };
}

export class CreateProductDto {
    name: string;
    description: string;
    brand: string;
    modelName: string;
    gender?: ProductGender;
    categoryId: string;
    subCategoryId: string;
    basePrice: string;
    images: string[];
    inventory: string;
    options?: ProductOptionDto[];
    defaultVariant?: DefaultVariantDto;
    generatedVariants?: GeneratedVariantDto[];
    attributes?: ProductAttributesDto | null;
}