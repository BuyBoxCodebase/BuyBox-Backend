
interface CartProduct {
    productId: string;
    variantId?: string;
    quantity: number;
}

export interface AddToCartDto {
    products: CartProduct[];
}

export interface RemoveFromCartDto {
    productId: string;
    variantId?: string;
    quantity?: number;
}