import { describe, expect, it } from 'vitest';
import {
  act,
  advanceDays,
  affordableListing,
  buyWithLoan,
  content,
  newGame,
  systemContext,
} from '../../test/helpers.ts';
import type { GameState, Listing, Property } from '../state.ts';
import { aggressiveness, rivalEstimate, runDailyRivals } from './rivals.ts';
import { realValue } from './valuation.ts';

function rival(id: string) {
  const found = content.rivals.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No rival ${id}`);
  return found;
}

/** The state with one listing turned into a property and price of our choosing. */
function withBargain(changes: Partial<Property>, priceShare: number) {
  const state = newGame({ seed: 7 });
  const base = state.listings[0];
  if (!base) throw new Error('No listing');
  const property: Property = { ...base.property, ...changes };
  const value = realValue(content, state, property).value;
  const listing: Listing = { ...base, property, askingPrice: Math.round(value * priceShare) };
  return { state: { ...state, listings: [listing] } as GameState, listing };
}

const monique: Partial<Property> = {
  kind: 'apartment',
  surface: 30,
  rooms: 1,
  floor: 1,
  lots: [],
  condition: 'good',
  neighbourhoodId: 'centreHistorique',
};

/** Runs the rivals' daily step up to `days` times, on the same draft. */
function runDays(state: GameState, days: number) {
  const ctx = systemContext(state);
  for (let i = 0; i < days && ctx.state.listings.length > 0; i++) runDailyRivals(ctx);
  return ctx;
}

describe('rivals', () => {
  it('Monique Delaporte snaps up a small flat sold well below its value', () => {
    const { state, listing } = withBargain(monique, 0.75);
    const ctx = runDays(state, 30);
    expect(ctx.state.listings).toEqual([]);
    expect(ctx.events).toContainEqual({
      type: 'listingSold',
      listingId: listing.id,
      buyer: 'rival',
      rivalId: 'delaporte',
    });
    const budget = ctx.state.rivals.delaporte?.budget ?? 0;
    expect(budget).toBe(
      Math.round(rival('delaporte').budget.start * 100 - listing.askingPrice * 1.075),
    );
  });

  it('ignores listings outside her preferences, fair prices, and offers the player made', () => {
    expect(runDays(withBargain({ ...monique, surface: 80 }, 0.75).state, 30).events).toEqual([]);
    expect(runDays(withBargain(monique, 1.02).state, 30).events).toEqual([]);
    const { state, listing } = withBargain(monique, 0.75);
    const offered = act(state, {
      type: 'market/offer',
      listingId: listing.id,
      amount: listing.askingPrice,
    }).state;
    expect(runDays(offered, 30).state.listings).toHaveLength(1);
  });

  it('the Martinot brothers renovate what they buy and put it back on the market', () => {
    const { state, listing } = withBargain(
      { kind: 'house', floor: null, lots: [], condition: 'toRenovate' },
      0.7,
    );
    const ctx = runDays(state, 60);
    const project = ctx.state.rivals.martinot?.projects[0];
    expect(project?.property.id).toBe(listing.property.id);
    if (!project) return;
    let current: GameState = ctx.state;
    const find = () => current.listings.find((l) => l.property.id === listing.property.id);
    for (let day = 0; day < 320 && !find(); day++) current = advanceDays(current, 1).state;
    const resold = find();
    expect(resold?.property.condition).toBe('renovated');
    expect(resold?.property.defects).toEqual([]);
    expect(resold?.motivationId).toBe('martinotResale');
  });

  it('makes offers on a property the player sells below its value', () => {
    const start = newGame({ seed: 99 });
    const { state } = buyWithLoan(start, affordableListing(start).id);
    const owned = state.properties[0];
    if (!owned) throw new Error('No property');
    // Make it something both rivals could want, priced far too low.
    const bargain: GameState = {
      ...state,
      properties: [{ ...owned, property: { ...owned.property, ...monique } }],
    };
    const value = realValue(content, bargain, { ...owned.property, ...monique }).value;
    let current = act(bargain, {
      type: 'sale/list',
      propertyId: owned.property.id,
      askingPrice: Math.round(value * 0.7),
      mode: 'self',
    }).state;
    let offerer: string | null = null;
    for (let day = 0; day < 60 && !offerer; day++) {
      const result = advanceDays(current, 1);
      current = result.state;
      for (const event of result.events) {
        if (event.type === 'saleOfferReceived' && event.buyerId) offerer = event.buyerId;
      }
    }
    expect(offerer).toBe('delaporte');
  });

  it('keeps one opinion per property, and grows bolder with the player’s wealth', () => {
    const state = newGame();
    const property = state.listings[0]?.property;
    if (!property) throw new Error('No listing');
    const ctx = { content, state };
    expect(rivalEstimate(ctx, rival('delaporte'), property)).toBe(
      rivalEstimate(ctx, rival('delaporte'), property),
    );
    expect(aggressiveness(content, state)).toBeCloseTo(1.015, 3);
    const rich = { ...state, player: { ...state.player, balance: 100_000_000 } };
    expect(aggressiveness(content, rich)).toBe(content.rivalRules.max);
  });
});
