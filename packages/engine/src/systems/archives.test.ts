import { describe, expect, it } from 'vitest';
import {
  act,
  advanceToNextMonth,
  affordableListing,
  buyWithLoan,
  content,
  engine,
  newGame,
  sampleOwned,
  systemContext,
} from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import type { GameState } from '../state.ts';
import { recordProgress } from './progress.ts';
import { moveOut } from './renting.ts';

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

describe('former tenants', () => {
  it('keeps the profile, the rents, the unpaid months and the satisfaction of a departure', () => {
    const state = newGame();
    const owned = sampleOwned(toDayNumber(state.clock.date));
    if (!owned.lease) throw new Error('let');
    owned.lease = { ...owned.lease, rentsReceived: 3_120_00, missedRents: 2, satisfaction: 40 };
    const ctx = systemContext({ ...state, properties: [owned] });
    moveOut(ctx, owned, 'notice');
    expect(owned.log.at(-1)).toMatchObject({
      kind: 'tenantOut',
      profileId: expect.any(String),
      rentsReceived: 3_120_00,
      missedRents: 2,
      satisfaction: 40,
    });
  });
});

describe('market curves', () => {
  it('takes the rate and every neighbourhood price on the start day and each 1st', () => {
    const start = newGame();
    expect(start.marketHistory).toHaveLength(1);
    const state = advanceToNextMonth(start).state;
    expect(state.marketHistory).toHaveLength(2);
    const point = state.marketHistory.at(-1);
    expect(point?.date).toEqual(state.clock.date);
    expect(point?.ratePercent).toBe(state.market.ratePercent);
    expect(Object.keys(point?.priceIndex ?? {})).toEqual(Object.keys(state.market.cities));
    expect(point?.priceIndex.dole?.centreHistorique).toBeCloseTo(
      state.market.cities.dole?.centreHistorique?.priceIndex ?? 0,
      4,
    );
  });
});

describe('chronicle', () => {
  it('tells the SCI, a rival, a move, and the first eviction and loan repaid only once', () => {
    const ctx = systemContext(newGame());
    recordProgress(ctx, [
      { type: 'companyCreated', cost: 300_00 },
      { type: 'rivalArrived', rivalId: 'horizon' },
      { type: 'movedCity', fromCityId: 'dole', cityId: 'dijon', monthlyRent: 600_00, cost: 900_00 },
      { type: 'loanRepaid', loanId: 'loan-1' },
      { type: 'loanRepaid', loanId: 'loan-2' },
      {
        type: 'tenantLeft',
        propertyId: 'p',
        reason: 'evicted',
        damages: 0,
        depositReturned: 0,
      },
      {
        type: 'tenantLeft',
        propertyId: 'p',
        reason: 'evicted',
        damages: 0,
        depositReturned: 0,
      },
    ]);
    const kinds = ctx.state.chronicle.map((entry) => entry.kind);
    for (const kind of ['companyCreated', 'rivalArrived', 'movedCity'] as const) {
      expect(kinds.filter((k) => k === kind)).toHaveLength(1);
    }
    expect(kinds.filter((k) => k === 'firstLoanRepaid')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'firstEviction')).toHaveLength(1);
    expect(ctx.state.chronicle.find((e) => e.kind === 'movedCity')?.ref).toBe('dijon');
  });
});

describe('price change of a neighbourhood', () => {
  it('compares today with the point some months ago, or the oldest one', () => {
    const start = newGame();
    expect(engine.priceChange(start, 'dole', 'centreHistorique', 12)).toBeNull();
    const state = months(start, 3);
    const change = engine.priceChange(state, 'dole', 'centreHistorique', 12);
    const first = state.marketHistory[0]?.priceIndex.dole?.centreHistorique ?? 1;
    const now = state.market.cities.dole?.centreHistorique?.priceIndex ?? 1;
    expect(change?.months).toBe(3);
    expect(change?.change).toBeCloseTo(now / first - 1, 6);
  });
});
