import { describe, expect, it } from 'vitest';
import { content, newGame, systemContext } from '../../test/helpers.ts';
import type { Property } from '../state.ts';
import { generateProperty } from './listings.ts';
import { estimateValue, realValue } from './valuation.ts';

function sampleProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'property-test',
    cityId: 'dole',
    neighbourhoodId: 'centreHistorique',
    kind: 'apartment',
    surface: 60,
    rooms: 3,
    floor: 1,
    lots: [],
    epoch: 'before1948',
    dpe: 'D',
    condition: 'toRefresh',
    defects: [],
    annualPropertyTax: 0,
    monthlyCharges: 0,
    ...overrides,
  };
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

describe('valuation', () => {
  it('keeps generated values on the observed price per m² of each neighbourhood', () => {
    const ctx = systemContext(newGame());
    // Neutral price level: compare with the city file directly.
    for (const n of Object.values(ctx.state.market.cities.dole ?? {})) n.priceIndex = 1;
    const perM2: Record<string, number[]> = {};
    for (let i = 0; i < 4000; i++) {
      const property = generateProperty(ctx, 'dole');
      if (property.kind === 'building') continue;
      const key = `${property.neighbourhoodId}/${property.kind}`;
      (perM2[key] ??= []).push(
        realValue(content, ctx.state, property).value / 100 / property.surface,
      );
    }
    const city = content.cities.dole;
    for (const n of city?.neighbourhoods ?? []) {
      for (const kind of ['apartment', 'house'] as const) {
        const values = perM2[`${n.id}/${kind}`] ?? [];
        if (values.length < 150) continue;
        expect(median(values) / n.sales[kind].pricePerM2.median).toBeGreaterThan(0.9);
        expect(median(values) / n.sales[kind].pricePerM2.median).toBeLessThan(1.1);
      }
    }
  });

  it('applies condition, DPE, defects and the price index', () => {
    const state = newGame();
    const base = realValue(content, state, sampleProperty()).value;
    expect(realValue(content, state, sampleProperty({ condition: 'ruin' })).value).toBeLessThan(
      base,
    );
    expect(realValue(content, state, sampleProperty({ dpe: 'G' })).value).toBeLessThan(base);
    const damp = sampleProperty({ defects: [{ id: 'humidity', revealed: false }] });
    // Values are rounded to the euro.
    expect(Math.abs(realValue(content, state, damp).value - base * 0.95)).toBeLessThanOrEqual(100);
    const doubled = systemContext(state).state;
    const centre = doubled.market.cities.dole?.centreHistorique;
    if (centre) centre.priceIndex *= 2;
    expect(
      Math.abs(realValue(content, doubled, sampleProperty()).value - base * 2),
    ).toBeLessThanOrEqual(200);
  });

  it('values small flats higher per m² than large ones', () => {
    const state = newGame();
    const small = realValue(content, state, sampleProperty({ surface: 25 })).value / 25;
    const large = realValue(content, state, sampleProperty({ surface: 110 })).value / 110;
    expect(small).toBeGreaterThan(large);
  });

  it('estimates from what the player knows', () => {
    const state = newGame();
    const hidden = sampleProperty({ defects: [{ id: 'dryRot', revealed: false }] });
    const real = realValue(content, state, hidden).value;
    const blind = estimateValue(content, state, hidden, false);
    // Hidden defects only count by their probability: the estimate is too optimistic.
    expect(blind.estimate).toBeGreaterThan(real);
    expect(blind.low).toBeLessThan(blind.estimate);
    expect(blind.high).toBeGreaterThan(blind.estimate);
    const clean = sampleProperty();
    // A visit that found nothing makes hidden defects less likely.
    expect(estimateValue(content, state, clean, true).estimate).toBeGreaterThan(
      estimateValue(content, state, clean, false).estimate,
    );
    const revealed = sampleProperty({ defects: [{ id: 'dryRot', revealed: true }] });
    expect(estimateValue(content, state, revealed, true).estimate).toBeLessThan(blind.estimate);
  });

  it('sells a whole building below the sum of its flats', () => {
    const state = newGame();
    const lots = [
      { surface: 40, rooms: 2 },
      { surface: 50, rooms: 2 },
    ];
    const building = sampleProperty({ kind: 'building', floor: null, lots, surface: 90, rooms: 4 });
    const flats = lots.reduce(
      (sum, lot) =>
        sum +
        realValue(content, state, sampleProperty({ surface: lot.surface, floor: null })).value,
      0,
    );
    const value = realValue(content, state, building).value;
    expect(value).toBeLessThan(flats);
    expect(value).toBeGreaterThan(flats * 0.6);
  });
});
