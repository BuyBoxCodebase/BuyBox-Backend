import { PaymentMode } from "@prisma/client";

class OrderProduct {
    productId: string;
    variantId?: string;
    quantity: number;
}

export class CreateOrderDto {
    email: string;
    phoneNumber: string;
    address: string;
    paymentMode: PaymentMode;
    cartId?: string;
    products?: OrderProduct;
}
