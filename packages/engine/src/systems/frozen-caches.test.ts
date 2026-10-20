import { describe, expect, it } from 'vitest';
import { content, newGame } from '../../test/helpers.ts';
import { deepClone } from '../clone.ts';
import type { Property } from '../state.ts';
import { itemId } from './dwelling.ts';
import { freezeListings } from './listings.ts';
import { estimateValue } from './valuation.ts';
import { worksCatalog, worksEstimate } from './works-view.ts';

/** A thawed copy of a frozen listing's property: nothing is cached for it. */
function thawed(property: Property): Property {
  return deepClone({ ...property, items: property.items.map((item) => ({ ...item })) });
}

describe('caches of frozen listings', () => {
  it('give the same catalogue, estimate and works estimate as a fresh computation', () => {
    const state = newGame();
    freezeListings(state);
    const listings = state.listings.slice(0, 20);
    expect(listings.every((listing) => Object.isFrozen(listing.property))).toBe(true);
    for (const listing of listings) {
      const frozen = listing.property;
      const fresh = thawed(frozen);
      expect(worksCatalog(content, state, frozen)).toEqual(worksCatalog(content, state, fresh));
      // Twice: the second answer comes from the cache.
      expect(worksCatalog(content, state, frozen)).toEqual(worksCatalog(content, state, fresh));
      for (const visited of [false, true]) {
        expect(estimateValue(content, state, frozen, visited)).toEqual(
          estimateValue(content, state, fresh, visited),
        );
      }
      const choices = frozen.items
        .filter((item) => item.state <= 3)
        .map((item) => ({ itemId: itemId(item), tier: 'standard' as const }));
      for (let i = 0; i < 2; i++) {
        expect(worksEstimate(content, state, frozen, choices)).toEqual(
          worksEstimate(content, state, fresh, choices),
        );
      }
    }
  });

  it('follow the price level of the neighbourhood', () => {
    const state = newGame();
    freezeListings(state);
    const listing = state.listings[0];
    if (!listing) throw new Error('no listing');
    const { cityId, neighbourhoodId } = listing.property;
    const before = estimateValue(content, state, listing.property, false).estimate;
    const market = state.market.cities[cityId]?.[neighbourhoodId];
    if (!market) throw new Error('no market');
    market.priceIndex *= 1.1;
    const after = estimateValue(content, state, listing.property, false).estimate;
    expect(after).toBe(estimateValue(content, state, thawed(listing.property), false).estimate);
    expect(after).toBeGreaterThan(before);
  });
});
