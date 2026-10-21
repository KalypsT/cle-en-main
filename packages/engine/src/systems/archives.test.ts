import { describe, expect, it } from 'vitest';
import {
  act,
  advanceToNextMonth,
  affordableListing,
  buyWithLoan,
  content,
  engine,
  newGame,
} from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import type { GameState } from '../state.ts';

function months(state: GameState, count: number): GameState {
  let current = state;
  for (let i = 0; i < count; i++) current = advanceToNextMonth(current).state;
  return current;
}

describe('reviews kept', () => {
  it('keeps the last statements, and reviews a past month from them', () => {
    const kept = content.rhythm.statementsKept;
    const state = months(newGame(), kept + 2);
    const { statements } = state.reviews;
    expect(statements).toHaveLength(kept);
    expect(statements.at(-1)).toEqual(state.lastStatement);
    const old = statements[0];
    if (!old) throw new Error('No statement');
    const review = engine.monthlyReview(state, old.date);
    expect(review?.date).toEqual(old.date);
    expect(review?.balance).toBe(old.balance);
    expect(review?.challenge).toBeNull();
    const point = state.history.find((p) => toDayNumber(p.date) === toDayNumber(old.date));
    expect(review?.netWorth).toBe(point?.netWorth);
    // The last one is today's review; a month no longer kept has none.
    expect(engine.monthlyReview(state, state.lastStatement?.date)).toEqual(
      engine.monthlyReview(state),
    );
    expect(engine.monthlyReview(state, state.startDate)).toBeNull();
  });

  it('keeps each yearly review with the tax of that year', () => {
    // From 18 October to the 1st of February: one 1st of January.
    const state = months(newGame(), 4);
    expect(state.reviews.years).toHaveLength(1);
    const [year] = state.reviews.years;
    expect(year?.review).toEqual(state.lastYearReview);
    expect(year?.assessment?.year).toBe(year?.review.year);
  });
});

describe('history of a property', () => {
  it('tells the purchase, the letting and the regime chosen', () => {
    const start = newGame({ seed: 99 });
    const listing = affordableListing(start);
    const { state: owner, event } = buyWithLoan(start, listing.id);
    if (event.type !== 'deedSigned') throw new Error('No deed');
    const propertyId = listing.property.id;
    const quote = engine.rentQuote(owner, propertyId, 'bare');
    let state = act(owner, {
      type: 'rent/list',
      propertyId,
      leaseType: 'bare',
      monthlyRent: quote?.market ?? 400_00,
      agencyId: null,
      insured: false,
    }).state;
    state = act(state, { type: 'rent/withdraw', propertyId }).state;
    state = act(state, { type: 'tax/setRegime', propertyId, regime: 'real' }).state;
    const log = state.properties[0]?.log ?? [];
    expect(log.map((entry) => entry.kind)).toEqual([
      'bought',
      'listedForRent',
      'rentalWithdrawn',
      'regime',
    ]);
    expect(log[0]).toMatchObject({ kind: 'bought', price: event.price });
    expect(log[3]).toMatchObject({ kind: 'regime', regime: 'real' });
    // The same regime again adds nothing.
    const again = act(state, { type: 'tax/setRegime', propertyId, regime: 'real' }).state;
    expect(again.properties[0]?.log).toHaveLength(4);
  });
});
