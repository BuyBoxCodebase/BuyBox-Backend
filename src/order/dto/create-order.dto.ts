import { PaymentMode, FulfillmentType } from "@prisma/client";
import { Coordinates } from "../../delivery-pricing/delivery-pricing.types";

class OrderProduct {
    productId: string;
    variantId?: string;
    quantity: number;
}

class DeliveryAddress {
    address: string;
    city: string;
    state?: string;
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
    // The delivery address as separate fields, saved so the next checkout can prefill it
    deliveryAddress?: DeliveryAddress;
    // A friend's referral code; re-checked and priced on the server
    referralCode?: string;
    // Referral earnings to spend on the products, in dollars. An exact amount rather than
    // "use my credit", so an EcoCash total can't move if the balance grows during payment.
    creditAmount?: number;
}
