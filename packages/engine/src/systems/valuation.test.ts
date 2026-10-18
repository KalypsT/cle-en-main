import { describe, expect, it } from 'vitest';
import { content, dwelling, newGame, systemContext, withState } from '../../test/helpers.ts';
import type { Property } from '../state.ts';
import { generateProperty } from './listings.ts';
import { estimateValue, realValue } from './valuation.ts';

function sampleProperty(overrides: Partial<Property> = {}, state = 3): Property {
  return {
    ...dwelling(
      {
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
        defects: [],
        annualPropertyTax: 0,
        monthlyCharges: 0,
        ...overrides,
      },
      state,
    ),
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

  it('applies the state of the items, DPE, nuisances and the price index', () => {
    const state = newGame();
    const base = realValue(content, state, sampleProperty()).value;
    expect(realValue(content, state, withState(sampleProperty(), 1)).value).toBeLessThan(base);
    expect(realValue(content, state, withState(sampleProperty(), 5)).value).toBeGreaterThan(base);
    expect(realValue(content, state, sampleProperty({ dpe: 'G' })).value).toBeLessThan(base);
    const noisy = sampleProperty({ defects: [{ id: 'noisyNeighbours', revealed: false }] });
    // Values are rounded to the euro.
    expect(Math.abs(realValue(content, state, noisy).value - base * 0.97)).toBeLessThanOrEqual(100);
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
    const base = sampleProperty();
    // The wiring is dead, and nobody has looked behind the switches yet.
    const items = base.items.map((item) =>
      item.kind === 'electricity'
        ? { ...item, state: 1, known: false }
        : { ...item, known: item.kind !== 'insulation' },
    );
    const hidden = { ...base, items };
    const real = realValue(content, state, hidden).value;
    const blind = estimateValue(content, state, hidden, false);
    // Unknown items count at the state the condition suggests: too optimistic here.
    expect(blind.estimate).toBeGreaterThan(real);
    expect(blind.low).toBeLessThan(blind.estimate);
    expect(blind.high).toBeGreaterThan(blind.estimate);
    const seen = { ...hidden, items: items.map((item) => ({ ...item, known: true })) };
    // Once every item is seen, only the chance of noisy neighbours separates them.
    const sharp = estimateValue(content, state, seen, true).estimate;
    expect(sharp).toBeLessThan(blind.estimate);
    expect(Math.abs(sharp / real - 1)).toBeLessThan(0.01);
    // A visit that found no noisy neighbour makes them less likely.
    expect(estimateValue(content, state, seen, true).estimate).toBeGreaterThan(
      estimateValue(content, state, seen, false).estimate,
    );
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
