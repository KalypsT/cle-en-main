import { type CalendarDate, fromDayNumber, nextDay } from '../calendar.ts';
import { findBank } from '../content.ts';
import { nextFloat } from '../random.ts';
import type { AgendaItem, Listing } from '../state.ts';
import { type BankActionRefusal, holdMeeting } from './banking.ts';
import type { SystemContext } from './context.ts';
import { repairIncident } from './leases.ts';
import type { RentRefusal } from './renting.ts';
import { dailyFreeTime } from './household.ts';
import { freezeItems, itemId } from './dwelling.ts';
import { findListing } from './listings.ts';

export type VisitRefusal =
  'listing.unknown' | 'visit.alreadyDone' | 'visit.alreadyPlanned' | 'time.noSlot';
export type AgendaRefusal = 'agenda.unknown' | 'agenda.invalidDay' | 'time.noSlot';

type PlannedAction = AgendaItem extends infer I
  ? I extends AgendaItem
    ? Omit<I, 'id' | 'day' | 'minutes'>
    : never
  : never;

/** Minutes already planned on a day, an item excepted. */
function plannedMinutes(ctx: SystemContext, day: number, exceptId?: string): number {
  return ctx.state.agenda
    .filter((item) => item.day === day && item.id !== exceptId)
    .reduce((sum, item) => sum + item.minutes, 0);
}

/** First later day with enough free time for `minutes`, within the planning horizon. */
function firstSlot(ctx: SystemContext, minutes: number): number | null {
  const { content, state } = ctx;
  let date: CalendarDate = state.clock.date;
  for (let offset = 1; offset <= content.market.visit.planningHorizonDays; offset++) {
    date = nextDay(date);
    const day = ctx.today + offset;
    if (dailyFreeTime(content, state, date) - plannedMinutes(ctx, day) >= minutes) return day;
  }
  return null;
}

/** Plans an action on the first day with enough free time. */
function plan(ctx: SystemContext, action: PlannedAction, minutes: number): number | null {
  const day = firstSlot(ctx, minutes);
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
  if (free - plannedMinutes(ctx, day, itemId) < item.minutes) return 'time.noSlot';
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
  const day = plan(ctx, { kind: 'bankMeeting', bankId }, minutes);
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
  const lease = state.properties.find((owned) => owned.property.id === propertyId)?.lease;
  const kind = content.renting.incidents.find((k) => k.id === lease?.incident?.kindId);
  if (
    !lease?.incident ||
    !kind ||
    !kind.selfRepair ||
    state.player.freeTimeMinutes >= kind.selfMinutes ||
    lease.incident.repair
  ) {
    return repairIncident(ctx, propertyId, 'self');
  }
  if (state.agenda.some((item) => item.kind === 'selfRepair' && item.propertyId === propertyId)) {
    return 'rent.repairBooked';
  }
  const day = plan(ctx, { kind: 'selfRepair', propertyId }, kind.selfMinutes);
  if (day === null) return 'time.noSlot';
  ctx.events.push({ type: 'selfRepairPlanned', propertyId, day });
  return null;
}

/** A visit costs its duration plus the trip (docs/03-systemes/01, « Le temps libre »). */
export function visitMinutes(ctx: Pick<SystemContext, 'content'>): number {
  const rules = ctx.content.market.visit;
  return rules.minutes + rules.travelMinutes;
}

function visit(ctx: SystemContext, listing: Listing): void {
  const revealed: string[] = [];
  for (const defect of listing.property.defects) {
    if (defect.revealed) continue;
    const rule = ctx.content.market.defects.find((r) => r.id === defect.id);
    if (rule && nextFloat(ctx.state.rng) < rule.revealChanceOnVisit) {
      defect.revealed = true;
      revealed.push(defect.id);
    }
  }
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
  if (state.player.freeTimeMinutes >= minutes) {
    state.player.freeTimeMinutes -= minutes;
    visit(ctx, listing);
    return null;
  }
  const day = plan(ctx, { kind: 'visit', listingId }, minutes);
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
    if (!listing || listing.visited || state.player.freeTimeMinutes < item.minutes) {
      ctx.events.push({ type: 'visitCancelled', listingId: item.listingId, day: item.day });
      continue;
    }
    state.player.freeTimeMinutes -= item.minutes;
    visit(ctx, listing);
  }
}
