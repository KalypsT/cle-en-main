import type { StatementLine } from '../events.ts';
import { toCents } from '../money.ts';
import { nextInt, nextRange, pickWeighted } from '../random.ts';
import type { CoproMeeting, CoproMeetingReport, OwnedProperty } from '../state.ts';
import type { SystemContext } from './context.ts';
import { clampState, dpeOf, energyNeeds, freezeItems } from './dwelling.ts';
import { findOwned } from './renting.ts';
import { addWorks } from './taxes.ts';
import { spendFreeTime } from './travel.ts';

/**
 * The co-ownership, simple version (docs/03-systemes/05, « La copropriété »):
 * one general meeting a year per building where the player owns a flat, one
 * or two resolutions, a vote weighted by his share of the building, a call
 * for funds spread over several months, better common parts.
 */

export type CoproRefusal =
  'property.unknown' | 'copro.noMeeting' | 'copro.unknownResolution' | 'time.notEnoughFreeTime';

function callMeeting(ctx: SystemContext, owned: OwnedProperty): void {
  const { content, state } = ctx;
  const rules = content.works.copro;
  const count = nextInt(
    state.rng,
    rules.resolutionsPerMeeting.min,
    rules.resolutionsPerMeeting.max,
  );
  const resolutions: CoproMeeting['resolutions'] = [];
  for (let i = 0; i < count; i++) {
    const left = rules.resolutions.filter((r) => !resolutions.some((x) => x.id === r.id));
    if (left.length === 0) break;
    const id = pickWeighted(state.rng, Object.fromEntries(left.map((r) => [r.id, r.weight])));
    const rule = left.find((r) => r.id === id);
    if (!rule) continue;
    resolutions.push({
      id,
      cost: toCents(
        Math.round(
          owned.property.surface * nextRange(state.rng, rule.costPerM2.min, rule.costPerM2.max),
        ),
      ),
      support: nextRange(state.rng, rule.support.min, rule.support.max),
      vote: null,
    });
  }
  if (resolutions.length === 0) return;
  owned.coproMeeting = { voteDay: ctx.today + rules.noticeDays, attended: false, resolutions };
  ctx.events.push({
    type: 'coproMeetingCalled',
    propertyId: owned.property.id,
    voteDay: owned.coproMeeting.voteDay,
    resolutions: resolutions.map((r) => ({ id: r.id, cost: r.cost })),
  });
}

/** The player's vote: going to the meeting costs free time once. */
export function voteResolution(
  ctx: SystemContext,
  propertyId: string,
  resolutionId: string,
  vote: 'for' | 'against',
): CoproRefusal | null {
  const { content, state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  const meeting = owned.coproMeeting;
  if (!meeting) return 'copro.noMeeting';
  const resolution = meeting.resolutions.find((r) => r.id === resolutionId);
  if (!resolution) return 'copro.unknownResolution';
  if (!meeting.attended) {
    const minutes = content.works.copro.attendMinutes;
    if (!spendFreeTime(ctx, minutes, owned.property.cityId)) return 'time.notEnoughFreeTime';
    meeting.attended = true;
  }
  resolution.vote = vote;
  return null;
}

function holdMeeting(ctx: SystemContext, owned: OwnedProperty, meeting: CoproMeeting): void {
  const { content, state } = ctx;
  const property = owned.property;
  const lots = property.copro?.lots ?? 1;
  const weight = 1 / lots;
  const results: { id: string; passed: boolean; textIndex: number }[] = [];
  const report: CoproMeetingReport = {
    day: ctx.today,
    attended: meeting.attended,
    resolutions: [],
    dpeBefore: property.dpe,
    dpeAfter: property.dpe,
  };
  for (const resolution of meeting.resolutions) {
    const rule = content.works.copro.resolutions.find((r) => r.id === resolution.id);
    if (!rule) continue;
    // Absent, the player's share is left to the others.
    const forShare =
      resolution.vote === null
        ? resolution.support
        : resolution.support * (1 - weight) + (resolution.vote === 'for' ? weight : 0);
    const passed = forShare > 0.5;
    const texts = passed ? content.worksTexts.meetingPassed : content.worksTexts.meetingRejected;
    const textIndex = nextInt(state.rng, 0, texts.length - 1);
    results.push({ id: resolution.id, passed, textIndex });
    const monthly = Math.round(resolution.cost / rule.months);
    report.resolutions.push({
      id: resolution.id,
      cost: resolution.cost,
      vote: resolution.vote,
      passed,
      textIndex,
      monthly: passed ? monthly : 0,
      months: passed ? rule.months : 0,
    });
    if (!passed) continue;
    owned.coproCalls.push({ monthly, monthsLeft: rule.months, resolutionId: resolution.id });
    if (rule.commonParts > 0 || rule.energy !== 1) {
      property.items = property.items.map((item) =>
        item.kind === 'commonParts'
          ? { ...item, state: clampState(item.state + rule.commonParts), tier: 'standard' }
          : item,
      );
      property.items = freezeItems(property.items);
    }
    if (rule.energy !== 1) {
      property.energyFactor *= rule.energy;
      property.dpe = dpeOf(content, energyNeeds(content, property));
    }
  }
  owned.coproMeeting = null;
  report.dpeAfter = property.dpe;
  owned.lastCoproMeeting = report;
  ctx.events.push({ type: 'coproMeetingHeld', propertyId: property.id, results });
}

/** General meetings: called on the 1st of the building's month, held after the notice. */
export function runDailyCopro(ctx: SystemContext): void {
  const { state } = ctx;
  for (const owned of state.properties) {
    const copro = owned.property.copro;
    if (!copro) continue;
    const meeting = owned.coproMeeting;
    if (meeting) {
      if (ctx.today >= meeting.voteDay) holdMeeting(ctx, owned, meeting);
      continue;
    }
    const { month, day } = state.clock.date;
    if (day === 1 && month === copro.meetingMonth) callMeeting(ctx, owned);
  }
}

/** Calls for funds voted by the co-ownership, with the monthly charges. */
export function runMonthlyCopro(ctx: SystemContext, lines: StatementLine[]): void {
  const { state } = ctx;
  for (const owned of state.properties) {
    if (owned.coproCalls.length === 0) continue;
    let total = 0;
    for (const call of owned.coproCalls) {
      total += call.monthly;
      call.monthsLeft -= 1;
    }
    owned.coproCalls = owned.coproCalls.filter((call) => call.monthsLeft > 0);
    state.player.balance -= total;
    addWorks(state, owned, total);
    lines.push({ kind: 'coproCall', propertyId: owned.property.id, amount: total });
  }
}
