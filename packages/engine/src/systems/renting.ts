import { findNeighbourhood, type GameContent } from '../content.ts';
import type { StatementLine } from '../events.ts';
import { type Cents, toCents } from '../money.ts';
import { nextFloat, nextInt } from '../random.ts';
import type { GameState, OwnedProperty, Property } from '../state.ts';
import type { SystemContext } from './context.ts';

/**
 * Provisional renting of milestone 1c: each owned property finds a tenant on
 * its own after a vacancy and pays the neighbourhood's rent. Milestone 2
 * replaces it with leases, applications, agencies and incidents.
 */

function rentPerM2(content: GameContent, property: Property, rooms: number): number {
  const rents = findNeighbourhood(content, property.cityId, property.neighbourhoodId).rentPerM2;
  if (property.kind === 'house') return rents.house;
  return rooms <= content.renting.smallApartmentMaxRooms
    ? rents.smallApartment
    : rents.largeApartment;
}

/** Monthly rent a tenant would pay today, before the owner's costs; 0 if it cannot be let. */
export function marketRent(content: GameContent, state: GameState, property: Property): Cents {
  const rules = content.renting;
  const factor = rules.conditionFactors[property.condition];
  if (factor === 0) return 0;
  const lots =
    property.kind === 'building'
      ? property.lots
      : [{ surface: property.surface, rooms: property.rooms }];
  const base = lots.reduce(
    (sum, lot) => sum + lot.surface * rentPerM2(content, property, lot.rooms),
    0,
  );
  const priceIndex =
    state.market.cities[property.cityId]?.[property.neighbourhoodId]?.priceIndex ?? 1;
  return toCents(Math.round(base * factor * priceIndex ** rules.priceIndexElasticity));
}

/** What the owner keeps of a rent until milestone 2 charges each cost for real. */
export function netRent(content: GameContent, rent: Cents): Cents {
  return Math.round(rent * (1 - content.renting.ownerCostsShare));
}

/** Rents currently paid by tenants, before costs: the banks retain a share of them. */
export function currentRents(state: GameState): Cents {
  return state.properties.reduce((sum, owned) => sum + (owned.lease?.monthlyRent ?? 0), 0);
}

export function drawVacancyEnd(ctx: SystemContext): number {
  const { min, max } = ctx.content.renting.vacancyDays;
  return ctx.today + nextInt(ctx.state.rng, Math.round(min), Math.round(max));
}

/** Tenants move into vacant properties whose vacancy is over. */
export function runDailyRenting(ctx: SystemContext): void {
  const { content, state } = ctx;
  for (const owned of state.properties) {
    if (owned.lease || ctx.today < owned.vacantUntilDay) continue;
    const rent = marketRent(content, state, owned.property);
    if (rent === 0) continue;
    owned.lease = { monthlyRent: rent, startDay: ctx.today };
    ctx.events.push({ type: 'propertyLet', propertyId: owned.property.id, monthlyRent: rent });
  }
}

function collect(ctx: SystemContext, owned: OwnedProperty, lines: StatementLine[]): boolean {
  if (!owned.lease) return false;
  const amount = netRent(ctx.content, owned.lease.monthlyRent);
  ctx.state.player.balance += amount;
  lines.push({ kind: 'rentalIncome', propertyId: owned.property.id, amount });
  return true;
}

/** Collects the month's rents, then some tenants give notice. */
export function runMonthlyRenting(ctx: SystemContext, lines: StatementLine[]): void {
  const { content, state } = ctx;
  let collected = false;
  for (const owned of state.properties) {
    if (!collect(ctx, owned, lines)) continue;
    collected = true;
    if (nextFloat(state.rng) < content.renting.monthlyDepartureProbability) {
      owned.lease = null;
      owned.vacantUntilDay = drawVacancyEnd(ctx);
      ctx.events.push({
        type: 'tenantLeft',
        propertyId: owned.property.id,
        vacantUntilDay: owned.vacantUntilDay,
      });
    }
  }
  if (collected) state.player.rentalHistoryMonths += 1;
}
