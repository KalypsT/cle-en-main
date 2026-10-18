import { findJob, type GameContent } from '../content.ts';
import { type CalendarDate, isWeekend, toDayNumber } from '../calendar.ts';
import type { StatementLine } from '../events.ts';
import { type Cents, toCents } from '../money.ts';
import { nextFloat } from '../random.ts';
import type { GameState, PlayerState } from '../state.ts';
import type { SystemContext } from './context.ts';

/** Expected monthly salary (average, bonuses included); 0 without a job. */
export function expectedSalary(content: GameContent, player: PlayerState): Cents {
  if (!player.employed) return 0;
  const job = findJob(content, player.jobId);
  return toCents(job.averageMonthlyTotal ?? job.netMonthlySalary);
}

/** Monthly living costs, rent excluded (content/train-de-vie.json). */
export function livingCosts(content: GameContent, player: PlayerState): Cents {
  const rules = content.livingCosts;
  const income = expectedSalary(content, player);
  const cost =
    toCents(rules.costAtReferenceIncome) +
    rules.shareOfIncomeDifference * (income - toCents(rules.referenceIncome));
  return Math.max(toCents(rules.minimum), Math.round(cost));
}

/** Free time available on `date`, in minutes. */
export function dailyFreeTime(content: GameContent, state: GameState, date: CalendarDate): number {
  const { player } = state;
  if (!player.employed) return content.unemployedFreeTimeMinutes;
  const freeTime = findJob(content, player.jobId).freeTime;
  if (freeTime.kind === 'regular') {
    // School holidays and RTT days arrive with the full agenda (milestone 6).
    return isWeekend(date) ? freeTime.weekendMinutes : freeTime.weekdayMinutes;
  }
  const index = toDayNumber(date) - toDayNumber(state.startDate);
  const cycle = freeTime.cycle;
  const day = cycle[((index % cycle.length) + cycle.length) % cycle.length];
  return day === 'rest' ? freeTime.restDayMinutes : freeTime.workDayMinutes;
}

/** Pays this month's salary, home rent and living costs. */
export function runMonthlyHousehold(ctx: SystemContext, lines: StatementLine[]): void {
  const { content, state } = ctx;
  const { player } = state;
  if (player.employed) {
    const job = findJob(content, player.jobId);
    const base = toCents(job.netMonthlySalary);
    const average = toCents(job.averageMonthlyTotal ?? job.netMonthlySalary);
    // Variable pay: uniform bonus whose mean is the job's average total.
    const bonus = average > base ? Math.round(nextFloat(state.rng) * 2 * (average - base)) : 0;
    player.balance += base + bonus;
    lines.push({ kind: 'salary', amount: base + bonus });
  }
  player.balance -= player.monthlyRent;
  lines.push({ kind: 'rent', amount: player.monthlyRent });
  const living = livingCosts(content, player);
  player.balance -= living;
  lines.push({ kind: 'livingCosts', amount: living });
}

export function startFreeDay(ctx: SystemContext, date: CalendarDate): void {
  ctx.state.player.freeTimeMinutes = dailyFreeTime(ctx.content, ctx.state, date);
}
