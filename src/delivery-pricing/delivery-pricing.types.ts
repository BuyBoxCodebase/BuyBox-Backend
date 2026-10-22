// Shared types for delivery pricing.

// A type alias rather than an interface, so Prisma accepts it as a JSON value
export type Coordinates = {
  latitude: number;
  longitude: number;
};

export interface Hub {
  id: string;
  name: string;
  coordinates: Coordinates;
  handlingFee: number;
}

// Applies in both directions.
export interface TransferFee {
  hubAId: string;
  hubBId: string;
  fee: number;
}

// Covers distances above the previous band's maxKm, up to and including this maxKm.
export interface DistanceBand {
  maxKm: number;
  fee: number;
}

export interface PricingConfig {
  transferFees: TransferFee[];
  distanceBands: DistanceBand[];
  beyondLastBandFee: number;
}

export type FulfillmentMethod = 'PICKUP' | 'DELIVERY';

export interface QuoteInput {
  method: FulfillmentMethod;
  // The hub the customer chose, for pickup and for home delivery
  hubId: string;
  // Home delivery only
  customerCoordinates?: Coordinates;
  // One entry per seller in the order; null when the seller has not set a location
  sellerCoordinates: (Coordinates | null)[];
}

export interface TransferLeg {
  originHubId: string | null; // null = sellers without a location
  fee: number;
}

export interface DeliveryQuote {
  hubId: string;
  hubName: string;
  transferLegs: TransferLeg[];
  transferFee: number;
  handlingFee: number;
  deliveryFee: number;
  deliveryDistanceKm: number | null;
  totalFee: number;
}
