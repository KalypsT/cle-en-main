import { describe, expect, it } from 'vitest';
import { newGame, quietContent, systemContext } from '../../test/helpers.ts';
import type { GameContent } from '../content.ts';
import { createEngine } from '../engine.ts';
import { answerChallenge, runDailyChallenges } from './challenges.ts';

function challengeContent(): GameContent {
  const content = quietContent();
  content.challenges.chancePerDay = 1;
  content.challenges.challenges = [
    {
      id: 'testMeetings',
      giver: 'gerard',
      conditions: [],
      goal: { stat: 'bankMeetings', gain: 1 },
      days: 30,
      rewardReputation: 5,
      penaltyReputation: -2,
      text: 'Un rendez-vous ce mois-ci ?',
      success: 'Bravo.',
      failure: 'Dommage.',
    },
  ];
  return content;
}

describe('challenges (docs/02, section 2.10)', () => {
  it('offers one challenge at a time, to accept within a few days', () => {
    const content = challengeContent();
    const engine = createEngine(content);
    const { state, events } = engine.advanceHours(newGame(), 24);
    expect(events).toContainEqual(expect.objectContaining({ type: 'challengeOffered' }));
    expect(engine.pendingDecisions(state).some((d) => d.kind === 'challengeOffer')).toBe(true);
    const later = engine.advanceHours(state, 24 * content.challenges.answerDays).events;
    expect(later.some((e) => e.type === 'challengeDeclined')).toBe(true);
    expect(later.filter((e) => e.type === 'challengeOffered')).toHaveLength(0);
  });

  it('rewards a challenge won and punishes one lost', () => {
    const content = challengeContent();
    const ctx = { ...systemContext(newGame()), content };
    runDailyChallenges(ctx);
    expect(answerChallenge(ctx, true)).toBeNull();
    expect(ctx.state.progress.challenge?.accepted).toBe(true);
    expect(answerChallenge(ctx, true)).toBe('challenge.alreadyAccepted');
    const reputation = ctx.state.player.reputation;
    ctx.state.progress.counters.bankMeetings = 1;
    runDailyChallenges(ctx);
    expect(ctx.state.player.reputation).toBe(reputation + 5);
    expect(ctx.state.progress.counters.challengesWon).toBe(1);
    expect(ctx.state.progress.challenge).toBeNull();
    expect(ctx.state.chronicle.at(-1)).toMatchObject({ kind: 'challengeWon', ref: 'testMeetings' });

    const lost = { ...systemContext(newGame()), content };
    runDailyChallenges(lost);
    answerChallenge(lost, true);
    const deadline = lost.state.progress.challenge?.deadlineDay ?? 0;
    const before = lost.state.player.reputation;
    lost.today = deadline;
    runDailyChallenges(lost);
    expect(lost.state.player.reputation).toBe(Math.max(0, before - 2));
    expect(lost.events.at(-1)).toMatchObject({ type: 'challengeLost' });
    // The next offer waits for the gap.
    expect(lost.state.progress.nextChallengeDay).toBe(deadline + content.challenges.minGapDays);
  });
});
