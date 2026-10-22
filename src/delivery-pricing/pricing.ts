// Delivery pricing rules. Total = transfer + handling (+ home delivery for DELIVERY).

import {
  Coordinates,
  DeliveryQuote,
  DistanceBand,
  Hub,
  PricingConfig,
  QuoteInput,
  TransferLeg,
} from './delivery-pricing.types';

const EARTH_RADIUS_KM = 6371;

export class PricingError extends Error {}

export function quoteDelivery(input: QuoteInput, hubs: Hub[], config: PricingConfig): DeliveryQuote {
  const hub = hubs.find((h) => h.id === input.hubId);
  if (!hub) {
    throw new PricingError('Selected hub does not exist');
  }

  const transferLegs = buildTransferLegs(input.sellerCoordinates, hub, hubs, config);
  const transferFee = sum(transferLegs.map((leg) => leg.fee));
  const handlingFee = hub.handlingFee;

  let deliveryFee = 0;
  let deliveryDistanceKm: number | null = null;
  if (input.method === 'DELIVERY') {
    if (!isValidCoordinates(input.customerCoordinates)) {
      throw new PricingError('Delivery location is required for home delivery');
    }
    deliveryDistanceKm = roundKm(distanceKm(hub.coordinates, input.customerCoordinates));
    deliveryFee = bandFee(deliveryDistanceKm, config);
  }

  return {
    hubId: hub.id,
    hubName: hub.name,
    transferLegs,
    transferFee,
    handlingFee,
    deliveryFee,
    deliveryDistanceKm,
    totalFee: roundMoney(transferFee + handlingFee + deliveryFee),
  };
}

// One leg per seller hub that differs from the chosen hub, so sellers sharing a hub share the fee.
// Sellers without a location are charged the cheapest transfer fee, once.
function buildTransferLegs(sellers: (Coordinates | null)[], destination: Hub, hubs: Hub[], config: PricingConfig): TransferLeg[] {
  const originIds = new Set<string>();
  let hasUnlocatedSeller = false;

  for (const coordinates of sellers) {
    if (isValidCoordinates(coordinates)) {
      originIds.add(nearestHub(coordinates, hubs).id);
    } else {
      hasUnlocatedSeller = true;
    }
  }

  const legs: TransferLeg[] = [...originIds]
    .filter((originId) => originId !== destination.id)
    .map((originId) => ({ originHubId: originId, fee: transferFeeBetween(originId, destination.id, config) }));

  if (hasUnlocatedSeller) {
    legs.push({ originHubId: null, fee: cheapestTransferFee(config) });
  }
  return legs;
}

export function nearestHub(point: Coordinates, hubs: Hub[]): Hub {
  if (hubs.length === 0) {
    throw new PricingError('No hubs are configured');
  }
  return hubs.reduce((best, hub) =>
    distanceKm(point, hub.coordinates) < distanceKm(point, best.coordinates) ? hub : best,
  );
}

export function transferFeeBetween(hubAId: string, hubBId: string, config: PricingConfig): number {
  const route = config.transferFees.find(
    (t) => (t.hubAId === hubAId && t.hubBId === hubBId) || (t.hubAId === hubBId && t.hubBId === hubAId),
  );
  if (!route) {
    throw new PricingError('No transfer fee is configured between these hubs');
  }
  return route.fee;
}

function cheapestTransferFee(config: PricingConfig): number {
  if (config.transferFees.length === 0) {
    throw new PricingError('No transfer fees are configured');
  }
  return Math.min(...config.transferFees.map((t) => t.fee));
}

// Bands are inclusive at the top: exactly 3 km is in the 0–3 km band.
export function bandFee(km: number, config: PricingConfig): number {
  const band = config.distanceBands.find((b) => km <= b.maxKm);
  return band ? band.fee : config.beyondLastBandFee;
}

// Great-circle distance using the Earth's radius (haversine formula).
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  const c = value as Coordinates;
  return (
    !!c &&
    typeof c.latitude === 'number' &&
    typeof c.longitude === 'number' &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180
  );
}

// Returns a list of problems; empty means the config is usable.
export function validateConfig(config: PricingConfig, hubIds: string[]): string[] {
  const problems: string[] = [];
  const isFee = (fee: unknown) => typeof fee === 'number' && Number.isFinite(fee) && fee >= 0;

  if (!Array.isArray(config.distanceBands) || config.distanceBands.length === 0) {
    problems.push('At least one distance band is required');
  } else {
    let previousMax = 0;
    for (const band of config.distanceBands) {
      if (typeof band.maxKm !== 'number' || band.maxKm <= previousMax) {
        problems.push('Distance bands must be in ascending order with no overlaps');
        break;
      }
      if (!isFee(band.fee)) problems.push(`Fee for band up to ${band.maxKm} km must be 0 or more`);
      previousMax = band.maxKm;
    }
  }

  if (!isFee(config.beyondLastBandFee)) {
    problems.push('Fee beyond the last band must be 0 or more');
  }

  const seen = new Set<string>();
  for (const t of config.transferFees ?? []) {
    if (!hubIds.includes(t.hubAId) || !hubIds.includes(t.hubBId) || t.hubAId === t.hubBId) {
      problems.push('Each transfer fee must connect two different existing hubs');
      continue;
    }
    const key = [t.hubAId, t.hubBId].sort().join('-');
    if (seen.has(key)) problems.push('Each pair of hubs can only have one transfer fee');
    seen.add(key);
    if (!isFee(t.fee)) problems.push('Transfer fees must be 0 or more');
  }

  // Every pair must be priced, otherwise some orders cannot be quoted
  for (let i = 0; i < hubIds.length; i++) {
    for (let j = i + 1; j < hubIds.length; j++) {
      if (!seen.has([hubIds[i], hubIds[j]].sort().join('-'))) {
        problems.push('Every pair of hubs needs a transfer fee');
        return problems;
      }
    }
  }
  return problems;
}

function sum(values: number[]): number {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundKm(value: number): number {
  return Math.round(value * 100) / 100;
}
