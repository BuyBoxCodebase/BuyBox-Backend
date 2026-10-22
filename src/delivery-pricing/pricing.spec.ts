import { bandFee, distanceKm, PricingError, quoteDelivery, validateConfig } from './pricing';
import { Coordinates, Hub, PricingConfig } from './delivery-pricing.types';

const HARARE: Hub = { id: 'harare', name: 'Harare', coordinates: { latitude: -17.8292, longitude: 31.0522 }, handlingFee: 5 };
const MUTARE: Hub = { id: 'mutare', name: 'Mutare', coordinates: { latitude: -18.9707, longitude: 32.6709 }, handlingFee: 5 };
const BULAWAYO: Hub = { id: 'bulawayo', name: 'Bulawayo', coordinates: { latitude: -20.1325, longitude: 28.6265 }, handlingFee: 5 };
const HUBS = [HARARE, MUTARE, BULAWAYO];

const CONFIG: PricingConfig = {
  transferFees: [
    { hubAId: 'harare', hubBId: 'mutare', fee: 5 },
    { hubAId: 'mutare', hubBId: 'bulawayo', fee: 14 },
    { hubAId: 'harare', hubBId: 'bulawayo', fee: 9 },
  ],
  distanceBands: [
    { maxKm: 3, fee: 3 },
    { maxKm: 5, fee: 4 },
    { maxKm: 10, fee: 6 },
    { maxKm: 15, fee: 8 },
    { maxKm: 20, fee: 10 },
    { maxKm: 25, fee: 12 },
    { maxKm: 30, fee: 15 },
  ],
  beyondLastBandFee: 15,
};

// A point roughly `km` kilometres due north of a hub.
function northOf(hub: Hub, km: number): Coordinates {
  return { latitude: hub.coordinates.latitude + km / 111.195, longitude: hub.coordinates.longitude };
}

// A seller sitting a little away from a hub, so the hub is clearly the nearest.
const sellerIn = (hub: Hub) => northOf(hub, 1);

describe('quoteDelivery', () => {
  it('charges only handling for a local pickup', () => {
    const quote = quoteDelivery({ method: 'PICKUP', hubId: 'harare', sellerCoordinates: [sellerIn(HARARE)] }, HUBS, CONFIG);

    expect(quote).toMatchObject({ transferFee: 0, handlingFee: 5, deliveryFee: 0, totalFee: 5, deliveryDistanceKm: null });
  });

  it('adds the transfer fee when the seller is in another city', () => {
    const quote = quoteDelivery({ method: 'PICKUP', hubId: 'harare', sellerCoordinates: [sellerIn(MUTARE)] }, HUBS, CONFIG);

    expect(quote).toMatchObject({ transferFee: 5, handlingFee: 5, totalFee: 10 });
  });

  it('adds the distance band for home delivery', () => {
    const quote = quoteDelivery(
      { method: 'DELIVERY', hubId: 'harare', customerCoordinates: northOf(HARARE, 7), sellerCoordinates: [sellerIn(BULAWAYO)] },
      HUBS,
      CONFIG,
    );

    expect(quote).toMatchObject({ transferFee: 9, handlingFee: 5, deliveryFee: 6, totalFee: 20 });
    expect(quote.deliveryDistanceKm).toBeCloseTo(7, 1);
  });

  it('charges each origin hub once and handling once for multi-city orders', () => {
    const quote = quoteDelivery(
      {
        method: 'DELIVERY',
        hubId: 'harare',
        customerCoordinates: northOf(HARARE, 2),
        sellerCoordinates: [sellerIn(MUTARE), sellerIn(MUTARE), sellerIn(BULAWAYO), sellerIn(HARARE)],
      },
      HUBS,
      CONFIG,
    );

    expect(quote.transferLegs).toHaveLength(2);
    expect(quote).toMatchObject({ transferFee: 14, handlingFee: 5, deliveryFee: 3, totalFee: 22 });
  });

  it('charges the flat fee for any distance past the last band', () => {
    const quote = quoteDelivery(
      { method: 'DELIVERY', hubId: 'harare', customerCoordinates: northOf(HARARE, 400), sellerCoordinates: [sellerIn(HARARE)] },
      HUBS,
      CONFIG,
    );

    expect(quote.deliveryFee).toBe(15);
  });

  it('charges the cheapest transfer fee once for sellers without a location', () => {
    const quote = quoteDelivery({ method: 'PICKUP', hubId: 'bulawayo', sellerCoordinates: [null, null] }, HUBS, CONFIG);

    expect(quote.transferLegs).toEqual([{ originHubId: null, fee: 5 }]);
    expect(quote.totalFee).toBe(10);
  });

  it('requires a location for home delivery', () => {
    expect(() =>
      quoteDelivery({ method: 'DELIVERY', hubId: 'harare', sellerCoordinates: [sellerIn(HARARE)] }, HUBS, CONFIG),
    ).toThrow(PricingError);
  });

  it('rejects an unknown hub', () => {
    expect(() => quoteDelivery({ method: 'PICKUP', hubId: 'gweru', sellerCoordinates: [] }, HUBS, CONFIG)).toThrow(PricingError);
  });
});

describe('bandFee', () => {
  it('treats band limits as inclusive', () => {
    expect(bandFee(0, CONFIG)).toBe(3);
    expect(bandFee(3, CONFIG)).toBe(3);
    expect(bandFee(3.01, CONFIG)).toBe(4);
    expect(bandFee(30, CONFIG)).toBe(15);
  });
});

describe('distanceKm', () => {
  it('matches the known Harare–Bulawayo straight-line distance', () => {
    expect(distanceKm(HARARE.coordinates, BULAWAYO.coordinates)).toBeGreaterThan(350);
    expect(distanceKm(HARARE.coordinates, BULAWAYO.coordinates)).toBeLessThan(375);
  });
});

describe('validateConfig', () => {
  const hubIds = HUBS.map((h) => h.id);

  it('accepts the default config', () => {
    expect(validateConfig(CONFIG, hubIds)).toEqual([]);
  });

  it('rejects overlapping bands', () => {
    const config = { ...CONFIG, distanceBands: [{ maxKm: 5, fee: 4 }, { maxKm: 3, fee: 3 }] };
    expect(validateConfig(config, hubIds)).not.toEqual([]);
  });

  it('rejects a missing hub pair', () => {
    const config = { ...CONFIG, transferFees: CONFIG.transferFees.slice(0, 2) };
    expect(validateConfig(config, hubIds)).toContain('Every pair of hubs needs a transfer fee');
  });
});
