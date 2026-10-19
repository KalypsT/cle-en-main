import { findCity, type CatalogEvent, type EventConditions, type EventEffect } from '../content.ts';
import type { GameContent } from '../content.ts';
import { type Cents, toCents } from '../money.ts';
import { nextFloat, nextInt, nextRange, pickWeighted } from '../random.ts';
import type { AnecdoteNote, CatalogEventInstance, GameState, OwnedProperty } from '../state.ts';
import { clampTrust, trustChange } from './banking.ts';
import type { SystemContext } from './context.ts';
import { clampState, freezeItems } from './dwelling.ts';
import { clampSatisfaction, giveNotice } from './leases.ts';
import { generateProperty, listingFor } from './listings.ts';
import { roundRate } from './market-rate.ts';
import { modeOf } from './modes.ts';
import { conditionsMet } from './progress.ts';
import { changeReputation, offMarketChancePerMonth } from './reputation.ts';

const DAYS_PER_MONTH = 30;
/** Key of `amounts` for an event without choices. */
export const NO_CHOICE = '_';

export type CatalogRefusal = 'event.unknown' | 'event.unknownChoice' | 'time.notEnoughFreeTime';

type Target = 'none' | 'lease' | 'owned' | 'vacant' | 'copro' | 'works';

/** Owned properties an event or anecdote may be about. */
function targetsOf(state: GameState, target: Target): OwnedProperty[] {
  const home = state.player.homePropertyId;
  switch (target) {
    case 'none':
      return [];
    case 'lease':
      return state.properties.filter((owned) => owned.lease !== null);
    case 'owned':
      return state.properties.filter((owned) => owned.property.id !== home);
    case 'vacant':
      return state.properties.filter(
        (owned) => owned.lease === null && owned.property.id !== home && !owned.sale?.agreement,
      );
    case 'copro':
      return state.properties.filter((owned) => owned.property.copro !== null);
    case 'works':
      return state.properties.filter((owned) => owned.works !== null);
  }
}

function gameConditionsMet(
  content: GameContent,
  state: GameState,
  conditions: EventConditions,
): boolean {
  const { player } = state;
  if (conditions.months && !conditions.months.includes(state.clock.date.month)) return false;
  if (conditions.jobs && !conditions.jobs.includes(player.jobId)) return false;
  if (conditions.employed !== undefined && conditions.employed !== player.employed) return false;
  if (conditions.renting !== undefined && conditions.renting !== (player.homePropertyId === null)) {
    return false;
  }
  if (conditions.hasLoan !== undefined && conditions.hasLoan !== state.loans.length > 0)
    return false;
  return !conditions.stats || conditionsMet(content, state, conditions.stats);
}

function targetConditionsMet(conditions: EventConditions, owned: OwnedProperty): boolean {
  const property = owned.property;
  if (conditions.item) {
    const { kind, maxState } = conditions.item;
    if (!property.items.some((item) => item.kind === kind && item.state <= maxState)) return false;
  }
  if (conditions.leaseType && owned.lease?.leaseType !== conditions.leaseType) return false;
  if (conditions.dpe && !conditions.dpe.includes(property.dpe)) return false;
  if (conditions.propertyKinds && !conditions.propertyKinds.includes(property.kind)) return false;
  if (conditions.satisfaction) {
    const satisfaction = owned.lease?.satisfaction;
    if (satisfaction === undefined) return false;
    if (satisfaction < conditions.satisfaction.min || satisfaction > conditions.satisfaction.max) {
      return false;
    }
  }
  return true;
}

function eligibleTargets(
  content: GameContent,
  state: GameState,
  target: Target,
  conditions: EventConditions,
): OwnedProperty[] | null {
  if (!gameConditionsMet(content, state, conditions)) return null;
  if (target === 'none') return [];
  const targets = targetsOf(state, target).filter((owned) =>
    targetConditionsMet(conditions, owned),
  );
  return targets.length > 0 ? targets : null;
}

/** Text variables of an event or anecdote, drawn once. */
function drawVars(
  ctx: SystemContext,
  owned: OwnedProperty | undefined,
  trade: string | undefined,
): CatalogEventInstance['vars'] {
  const { content, state } = ctx;
  const cityId = owned?.property.cityId ?? content.start.cityId;
  const neighbourhoods = findCity(content, cityId).neighbourhoods;
  const neighbourhoodId =
    owned?.property.neighbourhoodId ??
    neighbourhoods[nextInt(state.rng, 0, neighbourhoods.length - 1)]?.id ??
    '';
  const artisans = trade
    ? content.artisans.filter((a) => a.trade === trade && a.cities.includes(cityId))
    : [];
  const rivals = content.rivals.filter((rival) => rival.active && rival.cities.includes(cityId));
  return {
    tenant: owned?.lease?.tenant.firstName ?? null,
    artisanId:
      artisans.length > 0
        ? (artisans[nextInt(state.rng, 0, artisans.length - 1)]?.id ?? null)
        : null,
    neighbourhoodId,
    cityId,
    rivalId: rivals[nextInt(state.rng, 0, Math.max(0, rivals.length - 1))]?.id ?? '',
  };
}

function drawAmount(ctx: SystemContext, effects: readonly EventEffect[], owned?: OwnedProperty) {
  let amount: Cents = 0;
  for (const effect of effects) {
    if (effect.type === 'money') {
      amount += toCents(Math.round(nextRange(ctx.state.rng, effect.euros.min, effect.euros.max)));
    } else if (effect.type === 'rentMoney') {
      amount += Math.round((owned?.lease?.monthlyRent ?? 0) * effect.share);
    }
  }
  return amount;
}

function findEvent(content: GameContent, eventId: string): CatalogEvent | undefined {
  return content.events.find((event) => event.id === eventId);
}

/** Applies effects; the target may have gone (sold): its effects are then skipped. */
function applyEffects(
  ctx: SystemContext,
  instance: CatalogEventInstance,
  effects: readonly EventEffect[],
  amount: Cents,
  spendTime: boolean,
): void {
  const { content, state } = ctx;
  const owned = instance.propertyId
    ? state.properties.find((candidate) => candidate.property.id === instance.propertyId)
    : undefined;
  state.player.balance += amount;
  for (const effect of effects) {
    switch (effect.type) {
      case 'money':
      case 'rentMoney':
        break; // drawn when the event fired
      case 'reputation':
        changeReputation(ctx, effect.delta);
        break;
      case 'satisfaction':
        if (owned?.lease) {
          owned.lease.satisfaction = clampSatisfaction(owned.lease.satisfaction + effect.delta);
        }
        break;
      case 'trust': {
        const relation = state.banks[effect.bankId ?? content.start.accountBankId];
        if (relation) {
          relation.trust = clampTrust(relation.trust + trustChange(content, state, effect.delta));
        }
        break;
      }
      case 'item': {
        if (!owned) break;
        const worst = owned.property.items
          .filter((item) => item.kind === effect.item)
          .reduce<(typeof owned.property.items)[number] | null>(
            (min, item) => (min === null || item.state < min.state ? item : min),
            null,
          );
        if (!worst) break;
        const next = clampState(effect.set ?? worst.state + (effect.delta ?? 0));
        owned.property.items = freezeItems(
          owned.property.items.map((item) => (item === worst ? { ...item, state: next } : item)),
        );
        break;
      }
      case 'freeTime':
        if (spendTime) {
          state.player.freeTimeMinutes = Math.max(0, state.player.freeTimeMinutes - effect.minutes);
        }
        break;
      case 'tenantNotice':
        if (owned?.lease) giveNotice(ctx, owned, owned.lease, 'departure');
        break;
      case 'rent':
        if (owned?.lease) {
          owned.lease.monthlyRent = toCents(
            Math.round((owned.lease.monthlyRent * (1 + effect.share)) / 100),
          );
        }
        break;
      case 'priceIndex':
      case 'priceTrend':
        for (const [cityId, neighbourhoods] of Object.entries(state.market.cities)) {
          if (effect.scope !== 'france' && cityId !== instance.vars.cityId) continue;
          for (const [neighbourhoodId, market] of Object.entries(neighbourhoods)) {
            if (
              effect.scope === 'neighbourhood' &&
              neighbourhoodId !== instance.vars.neighbourhoodId
            ) {
              continue;
            }
            if (effect.type === 'priceIndex') market.priceIndex *= 1 + effect.percent / 100;
            else market.trendPercent += effect.percent;
          }
        }
        break;
      case 'marketRate':
        state.market.ratePercent = roundRate(
          Math.min(
            content.marketRate.maxPercent,
            Math.max(content.marketRate.minPercent, state.market.ratePercent + effect.delta),
          ),
        );
        break;
      case 'offMarketListing':
        offerOffMarket(ctx, instance.vars.cityId);
        break;
      case 'worksDelay': {
        const works = owned?.works;
        if (!works) break;
        for (const task of works.tasks) {
          if (task.status === 'done') continue;
          if (task.endDay !== null)
            task.endDay = Math.max(ctx.today + 1, task.endDay + effect.days);
          else task.availableDay = Math.max(ctx.today, task.availableDay + effect.days);
        }
        break;
      }
    }
  }
}

/** An agent offers a property before publishing it: the player alone sees it for a few days. */
export function offerOffMarket(ctx: SystemContext, cityId: string): void {
  const { content, state } = ctx;
  const effects = content.progression.effects;
  const listing = listingFor(ctx, generateProperty(ctx, cityId), effects.offMarketMotivationId);
  listing.publicDay = listing.publishedDay + effects.offMarketExclusiveDays;
  state.listings.push(listing);
  ctx.events.push({ type: 'offMarketOffered', listingId: listing.id });
}

function fire(ctx: SystemContext, event: CatalogEvent, owned: OwnedProperty | undefined): void {
  const { state } = ctx;
  const instance: CatalogEventInstance = {
    id: `event-${state.nextId++}`,
    eventId: event.id,
    day: ctx.today,
    deadlineDay: ctx.today + (event.deadlineDays ?? 0),
    textIndex: nextInt(state.rng, 0, event.texts.length - 1),
    propertyId: owned?.property.id ?? null,
    vars: drawVars(ctx, owned, event.artisanTrade),
    amounts: {},
  };
  state.catalog.lastDay[event.id] = ctx.today;
  if (!event.choices) {
    const effects = event.effects ?? [];
    instance.amounts[NO_CHOICE] = drawAmount(ctx, effects, owned);
    applyEffects(ctx, instance, effects, instance.amounts[NO_CHOICE], false);
    ctx.events.push({ type: 'catalogEventHappened', event: instance });
    return;
  }
  for (const choice of event.choices)
    instance.amounts[choice.id] = drawAmount(ctx, choice.effects, owned);
  state.catalog.pending.push(instance);
  ctx.events.push({ type: 'catalogEventStarted', event: instance });
}

function resolve(
  ctx: SystemContext,
  instance: CatalogEventInstance,
  choiceId: string,
  auto: boolean,
): void {
  const event = findEvent(ctx.content, instance.eventId);
  const choice = event?.choices?.find((candidate) => candidate.id === choiceId);
  ctx.state.catalog.pending = ctx.state.catalog.pending.filter((p) => p.id !== instance.id);
  if (choice) applyEffects(ctx, instance, choice.effects, instance.amounts[choiceId] ?? 0, !auto);
  ctx.events.push({ type: 'catalogEventResolved', event: instance, choiceId, auto });
}

/** The player's answer to a pending event. */
export function chooseEvent(
  ctx: SystemContext,
  instanceId: string,
  choiceId: string,
): CatalogRefusal | null {
  const instance = ctx.state.catalog.pending.find((p) => p.id === instanceId);
  if (!instance) return 'event.unknown';
  const choice = findEvent(ctx.content, instance.eventId)?.choices?.find((c) => c.id === choiceId);
  if (!choice) return 'event.unknownChoice';
  const minutes = choice.effects.reduce(
    (sum, effect) => sum + (effect.type === 'freeTime' ? effect.minutes : 0),
    0,
  );
  if (ctx.state.player.freeTimeMinutes < minutes) return 'time.notEnoughFreeTime';
  resolve(ctx, instance, choiceId, false);
  return null;
}

/**
 * Daily life of the catalogue: unanswered events take their default choice,
 * new events fire by their monthly chance, then perhaps an anecdote and an
 * agent's off-market offer.
 */
export function runDailyCatalog(ctx: SystemContext): void {
  const { content, state } = ctx;
  const rules = content.rhythm.events;
  for (const instance of [...state.catalog.pending]) {
    if (instance.deadlineDay > ctx.today) continue;
    const event = findEvent(content, instance.eventId);
    resolve(ctx, instance, event?.defaultChoice ?? '', true);
  }
  const incidentFactor = modeOf(content, state).incidentFactor;
  let fired = 0;
  for (const event of content.events) {
    if (fired >= rules.maxPerDay || state.catalog.pending.length >= rules.maxPending) break;
    const last = state.catalog.lastDay[event.id];
    if (last !== undefined && ctx.today - last < event.cooldownDays) continue;
    const targets = eligibleTargets(content, state, event.target, event.conditions);
    if (!targets) continue;
    const count = event.target === 'none' ? 1 : targets.length;
    const factor = event.kind === 'mishap' ? incidentFactor : 1;
    const chance = (event.chancePerMonth * count * factor) / DAYS_PER_MONTH;
    if (nextFloat(state.rng) >= chance) continue;
    const owned =
      targets.length > 0 ? targets[nextInt(state.rng, 0, targets.length - 1)] : undefined;
    fire(ctx, event, owned);
    fired += 1;
  }
  if (nextFloat(state.rng) < rules.anecdoteChancePerDay) tellAnecdote(ctx);
  const offMarket = offMarketChancePerMonth(content, state);
  if (offMarket > 0 && nextFloat(state.rng) < offMarket / DAYS_PER_MONTH) {
    offerOffMarket(ctx, content.start.cityId);
  }
}

function tellAnecdote(ctx: SystemContext): void {
  const { content, state } = ctx;
  const candidates = new Map<string, { weight: number; targets: OwnedProperty[] }>();
  for (const anecdote of content.anecdotes) {
    const targets = eligibleTargets(content, state, anecdote.target, anecdote.conditions);
    if (targets) candidates.set(anecdote.id, { weight: anecdote.weight, targets });
  }
  if (candidates.size === 0) return;
  const id = pickWeighted(
    state.rng,
    Object.fromEntries([...candidates].map(([key, value]) => [key, value.weight])),
  );
  const anecdote = content.anecdotes.find((candidate) => candidate.id === id);
  const targets = candidates.get(id)?.targets ?? [];
  if (!anecdote) return;
  const owned = targets.length > 0 ? targets[nextInt(state.rng, 0, targets.length - 1)] : undefined;
  const note: AnecdoteNote = {
    anecdoteId: anecdote.id,
    day: ctx.today,
    textIndex: nextInt(state.rng, 0, anecdote.texts.length - 1),
    propertyId: owned?.property.id ?? null,
    vars: drawVars(ctx, owned, anecdote.artisanTrade),
  };
  state.catalog.anecdotes.push(note);
  const kept = content.rhythm.events.anecdotesKept;
  if (state.catalog.anecdotes.length > kept)
    state.catalog.anecdotes.splice(0, state.catalog.anecdotes.length - kept);
  ctx.events.push({ type: 'anecdote', anecdote: note });
}
