import { gameContent } from '@cle/content';
import type { GameAction } from '../src/actions.ts';
import { toDayNumber } from '../src/calendar.ts';
import { deepClone } from '../src/clone.ts';
import type { GameEvent } from '../src/events.ts';
import { createEngine, type CreateGameOptions } from '../src/index.ts';
import type { GameState } from '../src/state.ts';
import type { SystemContext } from '../src/systems/context.ts';

export const content = gameContent;
export const engine = createEngine(content);

export const defaultOptions: CreateGameOptions = {
  seed: 1234,
  // A Sunday, as in the milestone 0 tests.
  startDate: { year: 2026, month: 10, day: 18 },
  startHour: 8,
};

export function newGame(overrides: Partial<CreateGameOptions> = {}) {
  return engine.createGame({ ...defaultOptions, ...overrides });
}

/** Advances to 00:00 on the first day of the next month and returns that tick's events. */
export function advanceToNextMonth(state: ReturnType<typeof newGame>) {
  let current = state;
  for (;;) {
    const result = engine.tick(current);
    current = result.state;
    if (result.events.some((event) => event.type === 'monthStarted')) {
      return { state: current, events: result.events };
    }
  }
}

/** A system context on a copy of `state`, to call systems directly. */
export function systemContext(state: GameState): SystemContext {
  return { content, state: deepClone(state), events: [], today: toDayNumber(state.clock.date) };
}

/** Dispatches an action that must succeed. */
export function act(
  state: GameState,
  action: GameAction,
): { state: GameState; events: GameEvent[] } {
  const result = engine.dispatch(state, action);
  if (!result.ok) throw new Error(`${action.type} refused: ${result.reason.code}`);
  return { state: result.state, events: result.events };
}

/** Advances whole days (to the same hour) and collects the events. */
export function advanceDays(state: GameState, days: number) {
  return engine.advanceHours(state, days * 24);
}

/** Advances day by day until an event matches, within `maxDays`. */
export function advanceUntil(
  state: GameState,
  match: (event: GameEvent) => boolean,
  maxDays = 120,
): { state: GameState; events: GameEvent[]; event: GameEvent } {
  let current = state;
  const events: GameEvent[] = [];
  for (let day = 0; day < maxDays; day++) {
    const result = advanceDays(current, 1);
    current = result.state;
    events.push(...result.events);
    const event = result.events.find(match);
    if (event) return { state: current, events, event };
  }
  throw new Error('Expected event did not happen');
}

/** Cheapest listing whose asking price is at most `maxPrice` euros. */
export function affordableListing(state: GameState, maxPrice = 90_000) {
  const listing = [...state.listings]
    .filter((l) => l.askingPrice <= maxPrice * 100 && l.property.kind !== 'building')
    .sort((a, b) => a.askingPrice - b.askingPrice)[0];
  if (!listing) throw new Error('No affordable listing');
  return listing;
}

/**
 * Buys a listing at its asking price with a Tirelire loan of the price over
 * 20 years, up to the deed. Returns the state on the deed day.
 */
export function buyWithLoan(state: GameState, listingId: string) {
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) throw new Error('Unknown listing');
  let current = act(state, { type: 'market/offer', listingId, amount: listing.askingPrice }).state;
  const signed = advanceUntil(current, (e) => e.type === 'compromisSigned');
  current = signed.state;
  const purchase = current.purchases[0];
  if (!purchase) throw new Error('No compromis');
  current = act(current, {
    type: 'purchase/requestLoan',
    purchaseId: purchase.id,
    bankId: 'tirelire',
    amount: purchase.price,
    durationYears: 20,
  }).state;
  const answered = advanceUntil(current, (e) => e.type === 'loanAnswered');
  current = answered.state;
  const application = current.purchases[0]?.applications[0];
  if (!application) throw new Error('No application');
  current = act(current, {
    type: 'purchase/acceptLoan',
    purchaseId: purchase.id,
    applicationId: application.id,
  }).state;
  const deed = advanceUntil(
    current,
    (e) => e.type === 'deedSigned' || e.type === 'purchaseCancelled',
  );
  return { state: deed.state, event: deed.event, purchase };
}
