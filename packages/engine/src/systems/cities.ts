import type { GameContent } from '../content.ts';
import { findCity } from '../content.ts';
import { toCents, type Cents } from '../money.ts';
import { nextFloat } from '../random.ts';
import type { GameState, OwnedProperty } from '../state.ts';
import type { SystemContext } from './context.ts';
import { tripBetween } from './travel.ts';

export type MoveRefusal =
  'city.unknown' | 'move.sameCity' | 'move.ownHome' | 'move.tooSoon' | 'move.noMoney';

const MIN_RENOWN = 0;
const MAX_RENOWN = 100;

/** Monthly rent of the player's own home in a city (docs/03-systemes/08, « Déménager »). */
export function homeRent(content: GameContent, cityId: string): Cents {
  const start = findCity(content, content.start.cityId).commune.rentPerM2.smallApartment;
  const here = findCity(content, cityId).commune.rentPerM2.smallApartment;
  const step = content.citiesRules.moving.roundRentToEuros;
  const euros = Math.round((content.start.monthlyRent * here) / start / step) * step;
  return toCents(euros);
}

/** Local renown of a city, 0 … 100 (a city never worked in is at 0). */
export function renownOf(state: GameState, cityId: string): number {
  return state.player.renown[cityId] ?? 0;
}

/** Changes the renown of a city, kept between 0 and 100 (docs/02, section 2.8). */
export function changeRenown(ctx: SystemContext, cityId: string, delta: number): void {
  const scaled = Math.round(delta * ctx.content.citiesRules.renown.share * 100) / 100;
  if (scaled === 0) return;
  const { player } = ctx.state;
  const before = renownOf(ctx.state, cityId);
  const renown = Math.max(MIN_RENOWN, Math.min(MAX_RENOWN, before + scaled));
  if (renown === before) return;
  player.renown[cityId] = renown;
  ctx.events.push({ type: 'renownChanged', cityId, delta: renown - before, renown });
}

/** Moves the player's home to another city: new base, new rent, a moving cost. */
export function moveHome(ctx: SystemContext, cityId: string): MoveRefusal | null {
  const { content, state } = ctx;
  const { player } = state;
  if (!content.cities[cityId]) return 'city.unknown';
  if (cityId === player.baseCityId) return 'move.sameCity';
  if (player.homePropertyId !== null) return 'move.ownHome';
  const rules = content.citiesRules.moving;
  if (player.lastMoveDay !== null && ctx.today - player.lastMoveDay < rules.cooldownDays) {
    return 'move.tooSoon';
  }
  const cost = toCents(rules.costEuros);
  if (player.balance < cost) return 'move.noMoney';
  player.balance -= cost;
  const fromCityId = player.baseCityId;
  player.baseCityId = cityId;
  player.monthlyRent = homeRent(content, cityId);
  player.lastMoveDay = ctx.today;
  ctx.events.push({
    type: 'movedCity',
    fromCityId,
    cityId,
    monthlyRent: player.monthlyRent,
    cost,
  });
  return null;
}

/**
 * A property of another city, let or offered for rent, that the owner manages himself (no
 * agency, not his home). A vacant property, one under works or for sale, costs nothing.
 */
export function isRemoteSelfManaged(state: GameState, owned: OwnedProperty): boolean {
  const { property } = owned;
  if (property.cityId === state.player.baseCityId) return false;
  if (property.id === state.player.homePropertyId) return false;
  const letting = owned.lease ?? owned.rental;
  return letting !== null && letting.agencyId === null;
}

/** Monthly fee for a property managed from afar (docs/03-systemes/08, « Gérer à distance »). */
export function remoteManagementFee(content: GameContent): Cents {
  return toCents(content.citiesRules.remote.monthlyFeePerPropertyEuros);
}

/** Monthly chance of an agent of this city proposing an off-market property. */
export function localOffMarketChance(content: GameContent, state: GameState, cityId: string) {
  const rules = content.citiesRules.renown;
  return (renownOf(state, cityId) / MAX_RENOWN) * rules.maxLocalOffMarketChancePerMonth;
}

/** City of an off-market offer: the home city or a city where the player is known. */
export function pickOfferCity(ctx: SystemContext): string {
  const { content, state } = ctx;
  const weights = Object.keys(content.cities).map((cityId) => ({
    cityId,
    weight:
      renownOf(state, cityId) +
      (cityId === state.player.baseCityId ? content.citiesRules.renown.homeCityWeight : 0),
  }));
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  if (total <= 0) return state.player.baseCityId;
  let roll = nextFloat(state.rng) * total;
  for (const { cityId, weight } of weights) {
    roll -= weight;
    if (roll < 0) return cityId;
  }
  return state.player.baseCityId;
}

/** Round trip between the player's base and a city (information for the region map). */
export function tripFromBase(content: GameContent, state: GameState, cityId: string) {
  return tripBetween(content, state.player.baseCityId, cityId);
}
