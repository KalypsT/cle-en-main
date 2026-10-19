import type { GameContent } from '../content.ts';
import { toCents, type Cents } from '../money.ts';
import type { GameState } from '../state.ts';
import type { SystemContext } from './context.ts';

/** A round trip between two cities (docs/03-systemes/08, « Les déplacements »). */
export interface Trip {
  minutes: number;
  cost: Cents;
}

const NO_TRIP: Trip = { minutes: 0, cost: 0 };

/** Round trip between two cities; nothing inside a city, which the game neglects. */
export function tripBetween(content: GameContent, from: string, to: string): Trip {
  if (from === to) return NO_TRIP;
  const rules = content.citiesRules;
  const known = rules.trips.find(
    (trip) => (trip.a === from && trip.b === to) || (trip.a === to && trip.b === from),
  );
  const { oneWayMinutes, roundTripCostEuros } = known ?? rules.fallbackTrip;
  return { minutes: 2 * oneWayMinutes, cost: toCents(roundTripCostEuros) };
}

/** What the next action in `cityId` adds today: the trip, unless already made. */
export function pendingTrip(ctx: Pick<SystemContext, 'content' | 'state'>, cityId: string): Trip {
  const { player } = ctx.state;
  if (player.tripsToday.includes(cityId)) return NO_TRIP;
  return tripBetween(ctx.content, player.baseCityId, cityId);
}

/** Free time an action of `minutes` takes in `cityId`, the trip included. */
export function minutesWithTrip(
  ctx: Pick<SystemContext, 'content' | 'state'>,
  minutes: number,
  cityId: string,
): number {
  return minutes + pendingTrip(ctx, cityId).minutes;
}

/**
 * Spends today's free time on an action in `cityId` (the player's base when omitted),
 * with the day's trip there if it was not made yet. False, and nothing spent, if the
 * time is missing.
 */
export function spendFreeTime(ctx: SystemContext, minutes: number, cityId?: string): boolean {
  const { player } = ctx.state;
  const city = cityId ?? player.baseCityId;
  const trip = pendingTrip(ctx, city);
  if (player.freeTimeMinutes < minutes + trip.minutes) return false;
  player.freeTimeMinutes -= minutes + trip.minutes;
  makeTrip(ctx, city, trip);
  return true;
}

/** Records the day's trip to `cityId` and charges it. */
export function makeTrip(
  ctx: SystemContext,
  cityId: string,
  trip = pendingTrip(ctx, cityId),
): void {
  if (trip.minutes === 0 && trip.cost === 0) return;
  const { player } = ctx.state;
  player.tripsToday.push(cityId);
  player.balance -= trip.cost;
  ctx.events.push({ type: 'tripMade', cityId, minutes: trip.minutes, cost: trip.cost });
}

/** Free time left for work in `cityId` today once its trip is paid (0 if the trip does not fit). */
export function timeAvailableIn(ctx: Pick<SystemContext, 'content' | 'state'>, cityId: string) {
  return Math.max(0, ctx.state.player.freeTimeMinutes - pendingTrip(ctx, cityId).minutes);
}

export function baseCityOf(state: GameState): string {
  return state.player.baseCityId;
}
