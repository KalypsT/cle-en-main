import { describe, expect, it } from 'vitest';
import { act, advanceDays, content, engine, newGame } from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import type { GameEvent } from '../events.ts';
import { deepClone } from '../clone.ts';
import { serializeGame } from '../serialization.ts';
import type { CatalogEventInstance, GameState } from '../state.ts';
import { recordInbox } from './inbox.ts';

const limits = content.rhythm.inbox;

function today(state: GameState): number {
  return toDayNumber(state.clock.date);
}

/** Records `events` as if they had just happened in `state`. */
function record(state: GameState, events: GameEvent[], day = today(state)) {
  const after = deepClone(state);
  recordInbox(content, after, state, events, day);
  return after;
}

function catalogInstance(state: GameState): CatalogEventInstance {
  return {
    id: 'ev-1',
    eventId: 'tenantBirthday',
    day: today(state),
    deadlineDay: today(state) + 3,
    textIndex: 0,
    propertyId: null,
    vars: {
      tenant: null,
      artisanId: null,
      neighbourhoodId: 'centre',
      cityId: 'dole',
      rivalId: 'monique',
    },
    amounts: { pay: -50_00 },
  };
}

describe('inbox', () => {
  it('keeps the news of a day, without the calendar nor the market churn', () => {
    const state = advanceDays(newGame(), 40).state;
    const types = new Set(state.inbox.news.map((item) => item.event.type));
    expect(types.has('monthlyStatement')).toBe(true);
    for (const type of ['dayStarted', 'monthStarted', 'listingPublished', 'marketRateChanged']) {
      expect(types.has(type as never)).toBe(false);
    }
    const ids = state.inbox.news.map((item) => item.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    // Frozen: the daily copy of the state shares them.
    expect(state.inbox.news.every((item) => Object.isFrozen(item))).toBe(true);
  });

  it('tells the changes of a listing only when the player follows it', () => {
    const state = newGame();
    const [followed, other] = state.listings;
    if (!followed || !other) throw new Error('No listings');
    const liked = act(state, { type: 'market/favorite', listingId: followed.id, favorite: true });
    const sold = (listingId: string): GameEvent => ({
      type: 'listingSold',
      listingId,
      buyer: 'other',
    });
    const after = record(liked.state, [sold(followed.id), sold(other.id)]);
    expect(after.inbox.news).toEqual([
      expect.objectContaining({
        event: sold(followed.id),
        subject: expect.objectContaining({
          listingId: followed.id,
          propertyId: followed.property.id,
          neighbourhoodId: followed.property.neighbourhoodId,
        }),
      }),
    ]);
  });

  it('forgets the news past the limits of the content', () => {
    let state = newGame();
    const many = Array.from({ length: limits.newsKept + 5 }, (): GameEvent => ({
      type: 'overdraftEnded',
    }));
    state = record(state, many);
    expect(state.inbox.news).toHaveLength(limits.newsKept);
    expect(state.inbox.news[0]?.id).toBe(6);
    const later = record(state, [], today(state) + limits.newsKeptDays + 1);
    expect(later.inbox.news).toEqual([]);
  });

  it('keeps the settled catalogue events as letters, copied from the pending one', () => {
    const state = newGame();
    const instance = catalogInstance(state);
    const after = record(state, [
      { type: 'catalogEventResolved', event: instance, choiceId: 'pay', auto: true },
    ]);
    expect(after.inbox.mail).toEqual([
      expect.objectContaining({
        kind: 'catalogEvent',
        event: instance,
        choiceId: 'pay',
        auto: true,
        dismissed: false,
      }),
    ]);
    const letter = after.inbox.mail[0];
    expect(letter?.kind === 'catalogEvent' && letter.event).not.toBe(instance);
  });

  it('takes the counter-offer the player declined from the listing before', () => {
    const state = deepClone(newGame());
    const listing = state.listings[0];
    if (!listing) throw new Error('No listing');
    state.listings[0] = {
      ...listing,
      offer: { amount: 50_000_00, responseDay: 0, counter: { amount: 55_000_00, expiresDay: 0 } },
    };
    const after = record(state, [{ type: 'counterOfferDeclined', listingId: listing.id }]);
    expect(after.inbox.mail).toEqual([
      expect.objectContaining({
        kind: 'offerReply',
        outcome: 'counterDeclined',
        amount: 55_000_00,
      }),
    ]);
  });

  it('drops the closed letters first, then the oldest, past the limits', () => {
    let state = newGame();
    const refusal = (listingId: string): GameEvent => ({
      type: 'offerAnswered',
      listingId,
      answer: 'refused',
      amount: 10_000_00,
    });
    state = record(state, [refusal('a'), refusal('b'), refusal('c')]);
    const [first, second, third] = state.inbox.mail;
    state = act(state, { type: 'inbox/dismissMail', mailId: second?.id ?? 0 }).state;
    const more = Array.from({ length: limits.mailKept - 2 }, (_, i) => refusal(`d${i}`));
    state = record(state, more);
    // One too many: the closed letter goes, though it is not the oldest.
    expect(state.inbox.mail).toHaveLength(limits.mailKept);
    expect(state.inbox.mail[0]?.id).toBe(first?.id);
    expect(state.inbox.mail[1]?.id).toBe(third?.id);
    const later = record(state, [], today(state) + limits.mailKeptDays + 1);
    expect(later.inbox.mail).toEqual([]);
  });

  it('remembers the news the player has seen, and survives a save', () => {
    const state = advanceDays(newGame(), 40).state;
    expect(state.inbox.newsSeenId).toBe(0);
    const seen = act(state, { type: 'inbox/seeNews' }).state;
    expect(seen.inbox.newsSeenId).toBe(state.inbox.news.at(-1)?.id);
    expect(engine.loadGame(serializeGame(seen)).inbox).toEqual(seen.inbox);
  });
});
