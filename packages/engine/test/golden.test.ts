import { describe, expect, it } from 'vitest';
import type { GameAction, GameEvent, GameState } from '../src/index.ts';
import { engine } from './helpers.ts';

const GOLDEN_SEED = 20261018;
const DAYS = 365;

/**
 * Plays one year as a fonctionnaire who meets the Tirelire banker at the start
 * of every month and buys one modest property: on the 2nd at 18:00, visits
 * the listing that can be let whose estimate beats its asking price the most, then offers its
 * asking price, borrows the price over 20 years and signs. Once the property is
 * owned, it is let bare at the market rent, managed by the player, who accepts
 * the first candidate at 18:00 (milestone 2).
 */
function playReferenceGame() {
  let state = engine.createGame({
    seed: GOLDEN_SEED,
    startDate: { year: 2026, month: 10, day: 18 },
    startHour: 8,
  });
  const eventCounts: Record<string, number> = {};
  const record = (events: GameEvent[]) => {
    for (const event of events) eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
  };
  const tryAction = (action: GameAction) => {
    const result = engine.dispatch(state, action);
    if (result.ok) {
      state = result.state;
      record(result.events);
    }
  };
  for (let hour = 0; hour < DAYS * 24; hour++) {
    const result = engine.tick(state);
    state = result.state;
    record(result.events);
    for (const event of result.events) {
      const purchase = state.purchases[0];
      if (event.type === 'compromisSigned' && purchase) {
        tryAction({
          type: 'purchase/requestLoan',
          purchaseId: purchase.id,
          bankId: 'tirelire',
          amount: purchase.price,
          durationYears: 20,
        });
      }
      if (event.type === 'loanAnswered' && event.decision !== 'refused' && purchase) {
        tryAction({
          type: 'purchase/acceptLoan',
          purchaseId: purchase.id,
          applicationId: event.applicationId,
        });
      }
    }
    if (state.clock.hour === 18) {
      for (const owned of state.properties) {
        if (eventCounts.worksStarted === undefined && !owned.works) {
          tryAction({
            type: 'works/start',
            propertyId: owned.property.id,
            quoteIds: [],
            diy: [{ itemId: 'living.walls', tier: 'eco' }],
          });
        }
        if (!owned.lease && !owned.rental) {
          const quote = engine.rentQuote(state, owned.property.id, 'bare');
          if (quote && !quote.block) {
            tryAction({
              type: 'rent/list',
              propertyId: owned.property.id,
              leaseType: 'bare',
              monthlyRent: quote.market,
              agencyId: null,
              insured: false,
            });
          }
        }
        const application = owned.rental?.applications[0];
        if (application) {
          tryAction({
            type: 'rent/accept',
            propertyId: owned.property.id,
            applicationId: application.id,
          });
        }
      }
    }
    if (state.clock.date.day === 2 && state.clock.hour === 18) {
      tryAction({ type: 'bank/meet', bankId: 'tirelire' });
      const idle = state.properties.length === 0 && state.purchases.length === 0;
      const target = idle ? bestDeal(state) : undefined;
      if (target) {
        tryAction({ type: 'market/visit', listingId: target.id });
        tryAction({ type: 'market/offer', listingId: target.id, amount: target.askingPrice });
      }
    }
  }
  return summarize(state, eventCounts);
}

function bestDeal(state: GameState) {
  let best: { id: string; askingPrice: number; ratio: number } | undefined;
  for (const listing of state.listings) {
    // The reference game is played in Dole, the player's base.
    if (listing.property.cityId !== 'dole') continue;
    // A home to let: shops, parking spaces and land (milestone 8) are left aside.
    if (listing.property.kind !== 'apartment' && listing.property.kind !== 'house') continue;
    if (listing.offer || listing.askingPrice > 8_000_000) continue;
    if (engine.rentQuote(state, listing.id, 'bare')?.block) continue;
    const ratio = (engine.estimate(state, listing.id)?.estimate ?? 0) / listing.askingPrice;
    if (!best || ratio > best.ratio)
      best = { id: listing.id, askingPrice: listing.askingPrice, ratio };
  }
  return best;
}

/** The parts of the state worth freezing; the listings are summarized. */
function summarize(state: GameState, eventCounts: Record<string, number>) {
  const { listings, ...rest } = state;
  return {
    state: rest,
    listings: {
      count: listings.length,
      totalAskingPrice: listings.reduce((sum, listing) => sum + listing.askingPrice, 0),
      ids: listings.map((listing) => listing.id),
    },
    netWorth: engine.netWorth(state),
    eventCounts,
  };
}

describe('golden seed', () => {
  it('reproduces the frozen reference game', async () => {
    const result = playReferenceGame();
    await expect(`${JSON.stringify(result, null, 2)}\n`).toMatchFileSnapshot(
      './golden/seed-20261018-365-days.json',
    );
  });

  it('is deterministic across runs', () => {
    expect(playReferenceGame()).toEqual(playReferenceGame());
  });

  it('buys a property in the reference game', () => {
    const result = playReferenceGame();
    expect(result.eventCounts.deedSigned).toBe(1);
    expect(result.state.properties).toHaveLength(1);
    expect(result.eventCounts.tenantMovedIn).toBeGreaterThanOrEqual(1);
    expect(result.eventCounts.taxAssessed).toBe(1);
    expect(result.eventCounts.worksCompleted).toBe(1);
  });
});
