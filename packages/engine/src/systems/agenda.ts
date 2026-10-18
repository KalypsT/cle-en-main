import { type CalendarDate, nextDay } from '../calendar.ts';
import { nextFloat } from '../random.ts';
import type { AgendaItem, Listing } from '../state.ts';
import type { SystemContext } from './context.ts';
import { dailyFreeTime } from './household.ts';
import { freezeItems, itemId } from './dwelling.ts';
import { findListing } from './listings.ts';

export type VisitRefusal =
  'listing.unknown' | 'visit.alreadyDone' | 'visit.alreadyPlanned' | 'time.noSlot';

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
  const { content, state } = ctx;
  const listing = findListing(state, listingId);
  if (!listing) return 'listing.unknown';
  if (listing.visited) return 'visit.alreadyDone';
  if (state.agenda.some((item) => item.listingId === listingId)) return 'visit.alreadyPlanned';
  const minutes = visitMinutes(ctx);
  if (state.player.freeTimeMinutes >= minutes) {
    state.player.freeTimeMinutes -= minutes;
    visit(ctx, listing);
    return null;
  }
  let date: CalendarDate = state.clock.date;
  for (let offset = 1; offset <= content.market.visit.planningHorizonDays; offset++) {
    date = nextDay(date);
    const day = ctx.today + offset;
    const planned = state.agenda
      .filter((item) => item.day === day)
      .reduce((sum, item) => sum + item.minutes, 0);
    if (dailyFreeTime(content, state, date) - planned >= minutes) {
      const item: AgendaItem = {
        id: `agenda-${state.nextId++}`,
        kind: 'visit',
        listingId,
        day,
        minutes,
      };
      state.agenda.push(item);
      ctx.events.push({ type: 'visitPlanned', listingId, day });
      return null;
    }
  }
  return 'time.noSlot';
}

/** Runs the actions planned for today, after the day's free time is set. */
export function runDailyAgenda(ctx: SystemContext): void {
  const { state } = ctx;
  const due = state.agenda.filter((item) => item.day <= ctx.today);
  if (due.length === 0) return;
  state.agenda = state.agenda.filter((item) => item.day > ctx.today);
  for (const item of due) {
    const listing = findListing(state, item.listingId);
    if (!listing || listing.visited || state.player.freeTimeMinutes < item.minutes) {
      ctx.events.push({ type: 'visitCancelled', listingId: item.listingId, day: item.day });
      continue;
    }
    state.player.freeTimeMinutes -= item.minutes;
    visit(ctx, listing);
  }
}
