import { PaymentMode, FulfillmentType } from "@prisma/client";
import { Coordinates } from "../../delivery-pricing/delivery-pricing.types";

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
    fulfillmentType?: FulfillmentType;
    // The hub the customer chose, for pickup and for home delivery
    pickupLocationId: string;
    pickupDate?: string;
    // Required for home delivery; the fee is calculated from it on the server
    deliveryCoordinates?: Coordinates;
}
