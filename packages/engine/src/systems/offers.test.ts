import { describe, expect, it } from 'vitest';
import {
  act,
  advanceDays,
  advanceUntil,
  engine,
  newGame,
  systemContext,
} from '../../test/helpers.ts';
import type { GameState } from '../state.ts';
import { sellerAnswer, sellerFloor } from './listings.ts';

function firstListing(state: GameState) {
  const listing = state.listings.find((l) => l.askingPrice < 9_000_000);
  if (!listing) throw new Error('No listing');
  return listing;
}

describe('offers', () => {
  it('accepts an offer at the asking price the next day and signs the compromis', () => {
    const state = newGame();
    const listing = firstListing(state);
    const offered = act(state, {
      type: 'market/offer',
      listingId: listing.id,
      amount: listing.askingPrice,
    });
    expect(offered.events).toContainEqual(expect.objectContaining({ type: 'offerMade' }));
    const { state: after, events } = advanceUntil(
      offered.state,
      (e) => e.type === 'compromisSigned',
      3,
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'offerAnswered',
        answer: 'accepted',
        price: listing.askingPrice,
      }),
    );
    const purchase = after.purchases[0];
    expect(purchase?.price).toBe(listing.askingPrice);
    expect(after.listings.some((l) => l.id === listing.id)).toBe(false);
    expect(purchase?.deposit).toBe(Math.round(listing.askingPrice * 0.05));
  });

  it('refuses lowball offers and counters offers just under the floor', () => {
    const ctx = systemContext(newGame());
    const listing = firstListing(ctx.state);
    const floor = sellerFloor(ctx, listing);
    expect(floor).toBeLessThanOrEqual(listing.askingPrice);
    expect(sellerAnswer(ctx, listing, Math.round(listing.askingPrice * 0.5))).toEqual({
      answer: 'refused',
    });
    expect(sellerAnswer(ctx, listing, floor)).toEqual({ answer: 'accepted', price: floor });
    const near = sellerAnswer(ctx, listing, Math.round(floor * 0.98));
    expect(near.answer).toBe('counterOffer');
    if (near.answer === 'counterOffer') {
      expect(near.amount).toBeGreaterThanOrEqual(floor);
      expect(near.amount).toBeLessThanOrEqual(listing.askingPrice);
    }
  });

  it('lets the player take the single counter-offer', () => {
    let state = newGame();
    const listing = firstListing(state);
    const floor = sellerFloor(systemContext(state), listing);
    state = act(state, {
      type: 'market/offer',
      listingId: listing.id,
      amount: Math.round(floor * 0.98),
    }).state;
    const countered = advanceUntil(state, (e) => e.type === 'offerAnswered', 3);
    expect(countered.event).toMatchObject({ answer: 'counterOffer' });
    const counter = countered.state.listings.find((l) => l.id === listing.id)?.offer?.counter;
    if (!counter) throw new Error('No counter-offer');
    const taken = act(countered.state, {
      type: 'market/answerCounter',
      listingId: listing.id,
      accept: true,
    });
    expect(taken.state.purchases[0]?.price).toBe(counter.amount);
  });

  it('validates offers', () => {
    let state = newGame();
    const listing = firstListing(state);
    const refuse = (s: GameState, amount: number) => {
      const result = engine.dispatch(s, { type: 'market/offer', listingId: listing.id, amount });
      return result.ok ? null : result.reason.code;
    };
    expect(refuse(state, 0)).toBe('offer.invalidAmount');
    expect(refuse(state, 1_000_000_000_00)).toBe('account.insufficientFunds');
    expect(
      engine.dispatch(state, { type: 'market/offer', listingId: 'nope', amount: 100 }).ok,
    ).toBe(false);
    state = act(state, { type: 'market/offer', listingId: listing.id, amount: 100_000 }).state;
    expect(refuse(state, 100_000)).toBe('offer.pending');
    state = advanceDays(state, 2).state;
    // Another buyer may have taken it in the meantime.
    if (!state.listings.some((l) => l.id === listing.id && !l.offer)) return;
    state = act(state, { type: 'market/offer', listingId: listing.id, amount: 100_000 }).state;
    state = advanceDays(state, 2).state;
    if (state.listings.some((l) => l.id === listing.id && !l.offer)) {
      expect(refuse(state, 100_000)).toBe('offer.tooMany');
    }
  });

  it('gives the salesperson a better floor', () => {
    const civil = systemContext(newGame());
    const sales = systemContext(newGame({ jobId: 'salesperson' }));
    const listing = firstListing(civil.state);
    expect(sellerFloor(sales, listing)).toBeLessThanOrEqual(sellerFloor(civil, listing));
  });
});
