import { describe, expect, it } from 'vitest';
import { act, content, engine, newGame, sampleOwned, systemContext } from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import type { OtherKind, Property } from '../state.ts';
import { generateProperty } from './listings.ts';
import { lettingBlock, marketRent } from './renting.ts';
import { realValue } from './valuation.ts';

/** Many generated properties of one city, to look at the new kinds. */
function generated(count: number): Property[] {
  const ctx = systemContext(newGame({ seed: 5 }));
  return Array.from({ length: count }, () => generateProperty(ctx, 'dole'));
}

describe('shops, parking spaces and building land (milestone 8)', () => {
  it('appear in the flow at their hand-written shares, without rooms nor items', () => {
    const properties = generated(4000);
    for (const kind of ['commercial', 'parking', 'land'] as OtherKind[]) {
      const rule = content.market.otherKinds[kind];
      const share = properties.filter((p) => p.kind === kind).length / properties.length;
      expect(share).toBeGreaterThan(rule.share * 0.7);
      expect(share).toBeLessThan(rule.share * 1.3);
      for (const property of properties.filter((p) => p.kind === kind)) {
        expect(property.items).toEqual([]);
        expect(property.surface).toBeGreaterThanOrEqual(rule.surface.min);
        expect(property.surface).toBeLessThanOrEqual(rule.surface.max);
        expect(property.copro).toBeNull();
      }
    }
  });

  it('are worth and let at their ratios of the neighbourhood’s flats', () => {
    const state = newGame({ seed: 5 });
    const properties = generated(3000);
    for (const kind of ['commercial', 'parking'] as const) {
      const property = properties.find((p) => p.kind === kind);
      if (!property) throw new Error(`no ${kind}`);
      const value = realValue(content, state, property).value;
      const rent = marketRent(content, state, property, kind);
      const yearly = (rent * 12) / value;
      // A gross yield between 5 % and 11 %: better than a flat, as it should.
      expect(yearly).toBeGreaterThan(0.05);
      expect(yearly).toBeLessThan(0.11);
      // The housing DPE rules do not apply.
      expect(lettingBlock(content, property, toDayNumber({ year: 2040, month: 1, day: 1 }))).toBe(
        null,
      );
    }
    const land = properties.find((p) => p.kind === 'land');
    if (!land) throw new Error('no land');
    expect(lettingBlock(content, land, 0)).toBe('rent.notLettable');
  });

  it('let a parking space with its own lease, never as a home', () => {
    const state = newGame({ seed: 7 });
    const today = toDayNumber(state.clock.date);
    const owned = sampleOwned(today, {
      let: false,
      property: { kind: 'parking', surface: 13, rooms: 0, floor: null, spaces: [], items: [] },
    });
    state.properties = [owned];
    const quote = engine.rentQuote(state, owned.property.id, 'parking');
    if (!quote) throw new Error('no quote');
    const asHome = engine.dispatch(state, {
      type: 'rent/list',
      propertyId: owned.property.id,
      leaseType: 'bare',
      monthlyRent: quote.market,
      agencyId: null,
      insured: false,
    });
    expect(asHome.ok ? null : asHome.reason.code).toBe('rent.leaseNotAllowed');
    const listed = act(state, {
      type: 'rent/list',
      propertyId: owned.property.id,
      leaseType: 'parking',
      monthlyRent: quote.market,
      agencyId: null,
      insured: false,
    }).state;
    expect(listed.properties[0]?.rental?.leaseType).toBe('parking');
  });

  it('prices land and attics by what one could build on them (« compte à rebours »)', () => {
    const state = newGame({ seed: 5 });
    const land = generated(4000).find((p) => p.kind === 'land');
    if (!land) throw new Error('no land');
    const rule = content.market.otherKinds.land;
    const median =
      content.cities.dole?.neighbourhoods.find((n) => n.id === land.neighbourhoodId)?.sales
        .apartment.pricePerM2.median ?? 0;
    const priceIndex = state.market.cities.dole?.[land.neighbourhoodId]?.priceIndex ?? 1;
    // Never under its floor price.
    expect(realValue(content, state, land).value).toBeGreaterThanOrEqual(
      Math.round(land.surface * median * priceIndex * rule.priceRatio * 100) - 1,
    );
    // Where houses are dear, land follows: it is worth more than its floor price.
    const dear = { ...land, cityId: 'dijon', neighbourhoodId: 'montchapetRepublique' };
    const dijonMedian =
      content.cities.dijon?.neighbourhoods.find((n) => n.id === 'montchapetRepublique')?.sales
        .apartment.pricePerM2.median ?? 0;
    const dijonIndex = state.market.cities.dijon?.montchapetRepublique?.priceIndex ?? 1;
    expect(realValue(content, state, dear).value).toBeGreaterThan(
      dear.surface * dijonMedian * dijonIndex * rule.priceRatio * 100,
    );
    // A convertible attic adds to a house's value.
    const house = generated(400).find((p) => p.kind === 'house');
    if (!house) throw new Error('no house');
    const without = realValue(content, state, { ...house, atticSurface: 0 }).value;
    const withAttic = realValue(content, state, {
      ...house,
      atticSurface: Math.round(house.surface * 0.3),
    }).value;
    expect(withAttic).toBeGreaterThan(without);
  });
});
