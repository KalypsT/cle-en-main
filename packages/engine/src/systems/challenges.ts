import { toDayNumber } from '../calendar.ts';
import type { Challenge, GameContent } from '../content.ts';
import { nextFloat, nextInt } from '../random.ts';
import type { GameState } from '../state.ts';
import type { SystemContext } from './context.ts';
import { addChronicle, conditionsMet, statValue } from './progress.ts';
import { changeReputation } from './reputation.ts';

export type ChallengeRefusal = 'challenge.none' | 'challenge.alreadyAccepted';

/** Challenges done lately are not offered again so soon. */
const RECENT = 3;

export function findChallenge(content: GameContent, id: string): Challenge | undefined {
  return content.challenges.challenges.find((challenge) => challenge.id === id);
}

function goalValue(content: GameContent, state: GameState, challenge: Challenge): number {
  return statValue(content, state, challenge.goal.stat, challenge.goal.key);
}

/** Progress towards the goal of the accepted challenge: [current, target]. */
export function challengeProgress(
  content: GameContent,
  state: GameState,
): { current: number; target: number } | null {
  const active = state.progress.challenge;
  const challenge = active && findChallenge(content, active.id);
  if (!active || !challenge) return null;
  const value = goalValue(content, state, challenge);
  if (challenge.goal.gain !== undefined) {
    return { current: Math.max(0, value - active.baseline), target: challenge.goal.gain };
  }
  return { current: value, target: challenge.goal.min ?? 0 };
}

function finish(ctx: SystemContext, challenge: Challenge, won: boolean): void {
  const { content, state } = ctx;
  const progress = state.progress;
  changeReputation(ctx, won ? challenge.rewardReputation : challenge.penaltyReputation);
  if (won) progress.counters.challengesWon = (progress.counters.challengesWon ?? 0) + 1;
  progress.challengeHistory.push({ id: challenge.id, day: ctx.today, won });
  progress.challenge = null;
  progress.nextChallengeDay = ctx.today + content.challenges.minGapDays;
  addChronicle(ctx, won ? 'challengeWon' : 'challengeLost', challenge.id);
  ctx.events.push({
    type: won ? 'challengeWon' : 'challengeLost',
    challengeId: challenge.id,
    reputation: state.player.reputation,
  });
}

/** Offers, expiries, successes and failures of the challenges (2 or 3 a year, one at a time). */
export function runDailyChallenges(ctx: SystemContext): void {
  const { content, state } = ctx;
  const progress = state.progress;
  const active = progress.challenge;
  if (active) {
    const challenge = findChallenge(content, active.id);
    if (!challenge) {
      progress.challenge = null;
      return;
    }
    if (!active.accepted) {
      if (ctx.today >= active.deadlineDay) {
        progress.challenge = null;
        progress.nextChallengeDay = ctx.today + content.challenges.minGapDays;
        ctx.events.push({ type: 'challengeDeclined', challengeId: active.id });
      }
      return;
    }
    const reached = challengeProgress(content, state);
    if (reached && reached.current >= reached.target) finish(ctx, challenge, true);
    else if (ctx.today >= active.deadlineDay) finish(ctx, challenge, false);
    return;
  }
  if (ctx.today < progress.nextChallengeDay) return;
  if (nextFloat(state.rng) >= content.challenges.chancePerDay) return;
  const recent = new Set(progress.challengeHistory.slice(-RECENT).map((entry) => entry.id));
  const month = state.clock.date.month;
  const eligible = content.challenges.challenges.filter(
    (challenge) =>
      !recent.has(challenge.id) &&
      (!challenge.months || challenge.months.includes(month)) &&
      conditionsMet(content, state, challenge.conditions) &&
      !alreadyReached(content, state, challenge),
  );
  if (eligible.length === 0) return;
  const challenge = eligible[nextInt(state.rng, 0, eligible.length - 1)];
  if (!challenge) return;
  progress.challenge = {
    id: challenge.id,
    offeredDay: ctx.today,
    deadlineDay: ctx.today + content.challenges.answerDays,
    accepted: false,
    baseline: 0,
  };
  ctx.events.push({
    type: 'challengeOffered',
    challengeId: challenge.id,
    deadlineDay: progress.challenge.deadlineDay,
  });
}

function alreadyReached(content: GameContent, state: GameState, challenge: Challenge): boolean {
  return (
    challenge.goal.min !== undefined && goalValue(content, state, challenge) >= challenge.goal.min
  );
}

export function answerChallenge(ctx: SystemContext, accept: boolean): ChallengeRefusal | null {
  const { content, state } = ctx;
  const active = state.progress.challenge;
  if (!active) return 'challenge.none';
  if (active.accepted) return 'challenge.alreadyAccepted';
  const challenge = findChallenge(content, active.id);
  if (!challenge || !accept) {
    state.progress.challenge = null;
    state.progress.nextChallengeDay = ctx.today + content.challenges.minGapDays;
    ctx.events.push({ type: 'challengeDeclined', challengeId: active.id });
    return null;
  }
  const yearEnd = toDayNumber({ year: state.clock.date.year, month: 12, day: 31 });
  active.accepted = true;
  active.baseline = goalValue(content, state, challenge);
  active.deadlineDay = (challenge.untilYearEnd ? yearEnd : ctx.today) + challenge.days;
  ctx.events.push({
    type: 'challengeAccepted',
    challengeId: challenge.id,
    deadlineDay: active.deadlineDay,
  });
  return null;
}
