import { type CalendarDate, fromDayNumber, nextDay } from '../calendar.ts';
import { findBank } from '../content.ts';
import { nextFloat } from '../random.ts';
import type { AgendaItem, Defect, Listing } from '../state.ts';
import { type BankActionRefusal, holdMeeting } from './banking.ts';
import type { SystemContext } from './context.ts';
import { repairIncident } from './leases.ts';
import type { RentRefusal } from './renting.ts';
import { dailyFreeTime } from './household.ts';
import { freezeItems, itemId } from './dwelling.ts';
import { editableListing, findListing } from './listings.ts';
import { minutesWithTrip, spendFreeTime, tripBetween } from './travel.ts';

export type VisitRefusal =
  'listing.unknown' | 'visit.alreadyDone' | 'visit.alreadyPlanned' | 'time.noSlot';
export type AgendaRefusal = 'agenda.unknown' | 'agenda.invalidDay' | 'time.noSlot';

type PlannedAction = AgendaItem extends infer I
  ? I extends AgendaItem
    ? Omit<I, 'id' | 'day' | 'minutes'>
    : never
  : never;

/** True if `minutes` in `cityId` (the base when omitted) fit in today's free time, trip included. */
function spendable(ctx: SystemContext, minutes: number, cityId?: string): boolean {
  const city = cityId ?? ctx.state.player.baseCityId;
  return ctx.state.player.freeTimeMinutes >= minutesWithTrip(ctx, minutes, city);
}

/** City where a planned action takes place (a banker is met in the base city). */
export function itemCity(ctx: Pick<SystemContext, 'state'>, item: AgendaItem): string {
  const { state } = ctx;
  if (item.kind === 'visit') {
    return findListing(state, item.listingId)?.property.cityId ?? state.player.baseCityId;
  }
  if (item.kind === 'selfRepair') {
    const owned = state.properties.find((o) => o.property.id === item.propertyId);
    return owned?.property.cityId ?? state.player.baseCityId;
  }
  return state.player.baseCityId;
}

/** Items planned on a day, an item excepted. */
function itemsOn(ctx: SystemContext, day: number, exceptId?: string): AgendaItem[] {
  return ctx.state.agenda.filter((item) => item.day === day && item.id !== exceptId);
}

/**
 * Minutes already planned on a day, an item excepted: the actions themselves and one
 * trip for each other city (the day on site of docs/03-systemes/08).
 */
function plannedMinutes(ctx: SystemContext, day: number, exceptId?: string): number {
  const items = itemsOn(ctx, day, exceptId);
  const cities = new Set(items.map((item) => itemCity(ctx, item)));
  const trips = [...cities].reduce(
    (sum, cityId) => sum + tripBetween(ctx.content, ctx.state.player.baseCityId, cityId).minutes,
    0,
  );
  return items.reduce((sum, item) => sum + item.minutes, 0) + trips;
}

/** Minutes an action in `cityId` adds to a day: itself, and the trip if the day has none there. */
function addedMinutes(
  ctx: SystemContext,
  day: number,
  minutes: number,
  cityId: string,
  exceptId?: string,
): number {
  const there = itemsOn(ctx, day, exceptId).some((item) => itemCity(ctx, item) === cityId);
  const trip = there ? 0 : tripBetween(ctx.content, ctx.state.player.baseCityId, cityId).minutes;
  return minutes + trip;
}

/** First later day with enough free time for `minutes` in `cityId`, within the planning horizon. */
function firstSlot(ctx: SystemContext, minutes: number, cityId: string): number | null {
  const { content, state } = ctx;
  const groupDays = content.citiesRules.dayOnSite.groupWithinDays;
  let date: CalendarDate = state.clock.date;
  let first: number | null = null;
  for (let offset = 1; offset <= content.market.visit.planningHorizonDays; offset++) {
    date = nextDay(date);
    const day = ctx.today + offset;
    const free = dailyFreeTime(content, state, date) - plannedMinutes(ctx, day);
    if (free < addedMinutes(ctx, day, minutes, cityId)) continue;
    // The day on site: a day that already has a trip to this city saves another one.
    const grouped =
      cityId !== state.player.baseCityId &&
      offset <= groupDays &&
      itemsOn(ctx, day).some((item) => itemCity(ctx, item) === cityId);
    if (grouped) return day;
    first ??= day;
    if (offset > groupDays || cityId === state.player.baseCityId) break;
  }
  return first;
}

/** Plans an action on the first day with enough free time. */
function plan(
  ctx: SystemContext,
  action: PlannedAction,
  minutes: number,
  cityId: string,
): number | null {
  const day = firstSlot(ctx, minutes, cityId);
  if (day === null) return null;
  ctx.state.agenda.push({
    ...action,
    id: `agenda-${ctx.state.nextId++}`,
    day,
    minutes,
  } as AgendaItem);
  return day;
}

/** Cancels a planned action. */
export function cancelAgendaItem(ctx: SystemContext, itemId: string): AgendaRefusal | null {
  if (!ctx.state.agenda.some((item) => item.id === itemId)) return 'agenda.unknown';
  ctx.state.agenda = ctx.state.agenda.filter((item) => item.id !== itemId);
  ctx.events.push({ type: 'agendaCancelled', itemId });
  return null;
}

/** Moves a planned action to another later day that has enough free time left. */
export function moveAgendaItem(
  ctx: SystemContext,
  itemId: string,
  day: number,
): AgendaRefusal | null {
  const { content, state } = ctx;
  const item = state.agenda.find((candidate) => candidate.id === itemId);
  if (!item) return 'agenda.unknown';
  const horizon = ctx.today + content.market.visit.planningHorizonDays;
  if (!Number.isInteger(day) || day <= ctx.today || day > horizon) return 'agenda.invalidDay';
  const free = dailyFreeTime(content, state, fromDayNumber(day));
  const needed = addedMinutes(ctx, day, item.minutes, itemCity(ctx, item), itemId);
  if (free - plannedMinutes(ctx, day, itemId) < needed) return 'time.noSlot';
  item.day = day;
  ctx.events.push({ type: 'agendaMoved', itemId, day });
  return null;
}

/** A banker meeting now, or on the first day with enough free time. */
export function requestMeeting(ctx: SystemContext, bankId: string): BankActionRefusal | null {
  const { content, state } = ctx;
  const bank = findBank(content, bankId);
  if (!bank) return 'bank.unknown';
  if (!bank.meetings) return 'bank.noMeetings';
  if (state.agenda.some((item) => item.kind === 'bankMeeting' && item.bankId === bankId)) {
    return 'bank.meetingTooSoon';
  }
  const minutes = content.credit.trust.meetingMinutes;
  if (state.player.freeTimeMinutes >= minutes) return holdMeeting(ctx, bankId);
  const relation = state.banks[bankId];
  if (
    relation?.lastMeetingDay != null &&
    ctx.today - relation.lastMeetingDay < content.credit.trust.meetingCooldownDays
  ) {
    return 'bank.meetingTooSoon';
  }
  const day = plan(ctx, { kind: 'bankMeeting', bankId }, minutes, state.player.baseCityId);
  if (day === null) return 'time.noSlot';
  ctx.events.push({ type: 'bankMeetingPlanned', bankId, day });
  return null;
}

/** Repairs a tenant's incident oneself now, or on the first day with enough free time. */
export function requestSelfRepair(
  ctx: SystemContext,
  propertyId: string,
): RentRefusal | 'time.noSlot' | null {
  const { content, state } = ctx;
  const owned = state.properties.find((o) => o.property.id === propertyId);
  const lease = owned?.lease;
  const kind = content.renting.incidents.find((k) => k.id === lease?.incident?.kindId);
  if (
    !lease?.incident ||
    !kind ||
    !kind.selfRepair ||
    spendable(ctx, kind.selfMinutes, owned?.property.cityId) ||
    lease.incident.repair
  ) {
    return repairIncident(ctx, propertyId, 'self');
  }
  if (state.agenda.some((item) => item.kind === 'selfRepair' && item.propertyId === propertyId)) {
    return 'rent.repairBooked';
  }
  const day = plan(
    ctx,
    { kind: 'selfRepair', propertyId },
    kind.selfMinutes,
    owned?.property.cityId ?? state.player.baseCityId,
  );
  if (day === null) return 'time.noSlot';
  ctx.events.push({ type: 'selfRepairPlanned', propertyId, day });
  return null;
}

/** A visit costs its duration plus the trip (docs/03-systemes/01, « Le temps libre »). */
export function visitMinutes(ctx: Pick<SystemContext, 'content'>): number {
  const rules = ctx.content.market.visit;
  return rules.minutes + rules.travelMinutes;
}

function visit(ctx: SystemContext, seen: Listing): void {
  const listing = editableListing(ctx, seen);
  const revealed: string[] = [];
  listing.property.defects = Object.freeze(
    listing.property.defects.map((defect) => {
      if (defect.revealed) return defect;
      const rule = ctx.content.market.defects.find((r) => r.id === defect.id);
      if (rule && nextFloat(ctx.state.rng) < rule.revealChanceOnVisit) {
        revealed.push(defect.id);
        return Object.freeze({ ...defect, revealed: true });
      }
      return defect;
    }),
  ) as Defect[];
  // Rooms are plain to see; technical elements only sometimes.
  const revealedItems: string[] = [];
  listing.property.items = listing.property.items.map((item) => {
    if (item.known) return item;
    const chance = ctx.content.works.items[item.kind].revealOnVisit;
    if (chance < 1 && nextFloat(ctx.state.rng) >= chance) return item;
    revealedItems.push(itemId(item));
    return { ...item, known: true };
  });
  listing.property.items = freezeItems(listing.property.items);
  listing.visited = true;
  ctx.events.push({
    type: 'visitDone',
    listingId: listing.id,
    revealedDefects: revealed,
    revealedItems,
  });
}

/**
 * Visits now if today's free time allows, otherwise on the first day with
 * enough free time left (the light agenda of docs/03-systemes/01).
 */
export function requestVisit(ctx: SystemContext, listingId: string): VisitRefusal | null {
  const { state } = ctx;
  const listing = findListing(state, listingId);
  if (!listing) return 'listing.unknown';
  if (listing.visited) return 'visit.alreadyDone';
  if (state.agenda.some((item) => item.kind === 'visit' && item.listingId === listingId)) {
    return 'visit.alreadyPlanned';
  }
  const minutes = visitMinutes(ctx);
  const cityId = listing.property.cityId;
  if (spendFreeTime(ctx, minutes, cityId)) {
    visit(ctx, listing);
    return null;
  }
  const day = plan(ctx, { kind: 'visit', listingId }, minutes, cityId);
  if (day === null) return 'time.noSlot';
  ctx.events.push({ type: 'visitPlanned', listingId, day });
  return null;
}

/** Runs the actions planned for today, after the day's free time is set. */
export function runDailyAgenda(ctx: SystemContext): void {
  const { state } = ctx;
  const due = state.agenda.filter((item) => item.day <= ctx.today);
  if (due.length === 0) return;
  state.agenda = state.agenda.filter((item) => item.day > ctx.today);
  for (const item of due) {
    if (item.kind === 'bankMeeting') {
      if (holdMeeting(ctx, item.bankId))
        ctx.events.push({ type: 'agendaCancelled', itemId: item.id });
      continue;
    }
    if (item.kind === 'selfRepair') {
      if (repairIncident(ctx, item.propertyId, 'self')) {
        ctx.events.push({ type: 'agendaCancelled', itemId: item.id });
      }
      continue;
    }
    const listing = findListing(state, item.listingId);
    if (!listing || listing.visited || !spendFreeTime(ctx, item.minutes, listing.property.cityId)) {
      ctx.events.push({ type: 'visitCancelled', listingId: item.listingId, day: item.day });
      continue;
    }
    visit(ctx, listing);
  }
}
