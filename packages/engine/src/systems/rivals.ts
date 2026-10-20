import type { GameContent, Rival } from '../content.ts';
import { type Cents, toCents } from '../money.ts';
import { hashNormal, nextFloat, nextRange } from '../random.ts';
import type { GameState, Listing, Property, RivalState } from '../state.ts';
import { toDayNumber } from '../calendar.ts';
import type { SystemContext } from './context.ts';
import { modeOf } from './modes.ts';
import { listingFor, removeListing } from './listings.ts';
import { netWorth } from './net-worth.ts';
import { realValue } from './valuation.ts';
import { occupiedDiscount } from './buyout.ts';
import {
  conditionLabel,
  dpeOf,
  energyNeeds,
  freezeItems,
  itemRule,
  renovatedItem,
} from './dwelling.ts';

/**
 * Named rivals (docs/03-systemes/03, « Les investisseurs rivaux »): a budget,
 * preferences and decision rules, no full simulation of their wealth. They buy
 * on the player's market and make offers on the properties the player sells.
 */

const DAYS_PER_MONTH = 30;

export function initialRivals(content: GameContent): Record<string, RivalState> {
  return Object.fromEntries(
    content.rivals.map((rival) => [
      rival.id,
      { arrivedDay: null, budget: toCents(rival.budget.start), purchases: 0, projects: [] },
    ]),
  );
}

/** A rival acts from the start, or once it has arrived (SCI Horizon). */
export function isRivalActive(state: GameState, rival: Rival): boolean {
  return rival.active || (state.rivals[rival.id]?.arrivedDay ?? null) !== null;
}

export function findRival(content: GameContent, rivalId: string): Rival | undefined {
  return content.rivals.find((rival) => rival.id === rivalId);
}

/** Rivals grow bolder as the player gets richer (1 at the start). */
export function aggressiveness(content: GameContent, state: GameState): number {
  const rules = content.rivalRules;
  const steps = Math.max(0, netWorth(content, state)) / toCents(rules.netWorthStep);
  return Math.min(rules.max, 1 + rules.perStep * steps) * modeOf(content, state).rivalFactor;
}

/** Interest of a rival for a property, 0 when it does not fit its preferences. */
export function interest(content: GameContent, rival: Rival, property: Property): number {
  const preferences = rival.preferences;
  if (!rival.cities.includes(property.cityId)) return 0;
  if (!preferences.kinds.includes(property.kind)) return 0;
  if (property.surface > preferences.maxSurface) return 0;
  if (!preferences.conditions.includes(conditionLabel(content, property))) return 0;
  return preferences.neighbourhoods[property.neighbourhoodId] ?? preferences.otherNeighbourhoods;
}

/**
 * The rival's own opinion of a property's value: the real value with an
 * error that stays the same for a given property, so that waiting does not
 * give it a new chance to misjudge.
 */
export function rivalEstimate(
  ctx: Pick<SystemContext, 'content' | 'state'>,
  rival: Rival,
  property: Property,
): Cents {
  const error =
    rival.estimationErrorStdDev * hashNormal(ctx.state.seed, `${rival.id}/${property.id}`);
  return Math.round(realValue(ctx.content, ctx.state, property).value * (1 + error));
}

function stateOf(ctx: SystemContext, rivalId: string): RivalState {
  let rivalState = ctx.state.rivals[rivalId];
  if (!rivalState) {
    rivalState = { arrivedDay: null, budget: 0, purchases: 0, projects: [] };
    ctx.state.rivals[rivalId] = rivalState;
  }
  return rivalState;
}

/** A rival takes over a property: its budget pays, a marchand de biens starts a project. */
export function rivalAcquired(
  ctx: SystemContext,
  rivalId: string,
  property: Property,
  price: Cents,
): void {
  const rival = findRival(ctx.content, rivalId);
  if (!rival) return;
  const rivalState = stateOf(ctx, rivalId);
  rivalState.budget -= Math.round(price * (1 + rival.costShare));
  rivalState.purchases += 1;
  if (rival.flip) {
    const months = nextRange(ctx.state.rng, rival.flip.months.min, rival.flip.months.max);
    rivalState.projects.push({
      property,
      resaleDay: ctx.today + Math.round(months * DAYS_PER_MONTH),
    });
  }
}

/** Monthly: late rivals arrive when their time has come, then the budgets grow. */
export function runMonthlyRivals(ctx: SystemContext): void {
  for (const rival of ctx.content.rivals) {
    if (!isRivalActive(ctx.state, rival)) {
      arriveIfDue(ctx, rival);
      continue;
    }
    const rivalState = stateOf(ctx, rival.id);
    rivalState.budget = Math.min(
      toCents(rival.budget.max),
      rivalState.budget + toCents(rival.budget.monthlyIncome),
    );
  }
}

const DAYS_PER_YEAR = 365;

/** The SCI Horizon comes once the game is old enough and the player rich enough. */
function arriveIfDue(ctx: SystemContext, rival: Rival): void {
  const arrival = rival.arrival;
  if (!arrival) return;
  const { content, state } = ctx;
  const yearsPlayed = (ctx.today - toDayNumber(state.startDate)) / DAYS_PER_YEAR;
  if (yearsPlayed < arrival.fromYear - 1) return;
  if (netWorth(content, state) < toCents(arrival.minPlayerNetWorth)) return;
  stateOf(ctx, rival.id).arrivedDay = ctx.today;
  ctx.events.push({ type: 'rivalArrived', rivalId: rival.id });
}

/** Finished renovations go back on the market as new listings. */
function relistProjects(ctx: SystemContext, rival: Rival, rivalState: RivalState): void {
  const flip = rival.flip;
  if (!flip) return;
  const due = rivalState.projects.filter((project) => project.resaleDay <= ctx.today);
  if (due.length === 0) return;
  rivalState.projects = rivalState.projects.filter((project) => project.resaleDay > ctx.today);
  for (const project of due) {
    // Every visible item is redone, the hidden ones only sometimes (« ou presque »).
    const before = project.property;
    const items = before.items.map((item) => {
      const visible = itemRule(ctx.content, item.kind).revealOnVisit >= 1;
      const redone =
        itemRule(ctx.content, item.kind).works !== null &&
        (visible || nextFloat(ctx.state.rng) < flip.hiddenWorksShare);
      return { ...(redone ? renovatedItem(item, flip.tier) : item), known: false };
    });
    const renovated = { ...before, items: freezeItems(items) };
    const property: Property = {
      ...renovated,
      dpe: dpeOf(ctx.content, energyNeeds(ctx.content, renovated)),
      postponedHazards: [],
    };
    const listing = listingFor(ctx, property, flip.motivationId);
    ctx.state.listings.push(listing);
    ctx.events.push({ type: 'listingPublished', listingId: listing.id });
    // The sale is not simulated: the rival's budget gets the asking price back.
    rivalState.budget = Math.min(
      toCents(rival.budget.max),
      rivalState.budget + listing.askingPrice,
    );
  }
}

function wantsListing(ctx: SystemContext, rival: Rival, listing: Listing): number {
  if (listing.offer || ctx.today < listing.publicDay) return 0;
  const weight = interest(ctx.content, rival, listing.property);
  if (weight === 0) return 0;
  const estimate = rivalEstimate(ctx, rival, listing.property);
  return estimate / listing.askingPrice - 1 >= rival.minBargain ? weight : 0;
}

/** Offers on the player's properties for sale that look like a bargain to a rival. */
function offerOnPlayerSales(
  ctx: SystemContext,
  rival: Rival,
  rivalState: RivalState,
  boldness: number,
): void {
  const { content, state } = ctx;
  const rules = rival.resaleOffers;
  for (const owned of state.properties) {
    const sale = owned.sale;
    if (!sale || sale.agreement) continue;
    if (sale.offers.some((offer) => offer.buyerId === rival.id)) continue;
    const weight = interest(ctx.content, rival, owned.property);
    if (weight === 0) continue;
    const estimate = Math.round(
      rivalEstimate(ctx, rival, owned.property) * (1 - occupiedDiscount(content, owned, ctx.today)),
    );
    if (estimate / sale.askingPrice - 1 < rules.minBargain) continue;
    if (sale.askingPrice * (1 + rival.costShare) > rivalState.budget) continue;
    if (nextFloat(state.rng) >= Math.min(1, rules.dailyReaction * boldness * weight)) continue;
    const step = toCents(content.market.pricing.rounding) / 2;
    const share = nextRange(state.rng, rules.offerShare.min, rules.offerShare.max);
    const amount = Math.max(step, Math.floor((sale.askingPrice * share) / step) * step);
    const offer = {
      id: `offer-${state.nextId++}`,
      buyerId: rival.id,
      amount,
      // Up to what still looks like a bargain, never above the asking price.
      buyerMax: Math.max(
        amount,
        Math.min(sale.askingPrice, Math.round(estimate / (1 + rules.minBargain))),
      ),
      expiresDay: ctx.today + content.market.resale.offerValidityDays,
      counterAmount: null,
    };
    sale.offers.push(offer);
    ctx.events.push({
      type: 'saleOfferReceived',
      propertyId: owned.property.id,
      offerId: offer.id,
      amount,
      buyerId: rival.id,
    });
  }
}

/**
 * Each day, before other buyers, active rivals relist their renovated
 * properties, buy the listings they want and make offers on the player's
 * properties for sale.
 */
export function runDailyRivals(ctx: SystemContext): void {
  const { content, state } = ctx;
  const active = content.rivals.filter((rival) => isRivalActive(state, rival));
  if (active.length === 0) return;
  const boldness = aggressiveness(content, state);
  for (const rival of active) {
    const rivalState = stateOf(ctx, rival.id);
    relistProjects(ctx, rival, rivalState);
    for (const listing of [...state.listings]) {
      const weight = wantsListing(ctx, rival, listing);
      if (weight === 0) continue;
      if (listing.askingPrice * (1 + rival.costShare) > rivalState.budget) continue;
      if (nextFloat(state.rng) >= Math.min(1, rival.dailyReaction * boldness * weight)) continue;
      removeListing(ctx, listing.id);
      rivalAcquired(ctx, rival.id, listing.property, listing.askingPrice);
      ctx.events.push({
        type: 'listingSold',
        listingId: listing.id,
        buyer: 'rival',
        rivalId: rival.id,
      });
    }
    offerOnPlayerSales(ctx, rival, rivalState, boldness);
  }
}
