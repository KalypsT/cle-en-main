import { gameContent } from '@cle/content';
import { type GameState, toDayNumber } from '@cle/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../engine.ts';
import { GameSession } from './game-session.ts';

const CHALLENGE_ID = gameContent.challenges.challenges[0]?.id ?? '';

function newState(): GameState {
  return engine.createGame({
    seed: 1234,
    startDate: { year: 2026, month: 10, day: 18 },
    startHour: 8,
  });
}

/** The next tick of the engine offers a challenge, which pauses the game. */
function offerChallengeOnNextTick() {
  const tick = engine.tick.bind(engine);
  vi.spyOn(engine, 'tick').mockImplementationOnce((state) => {
    const result = tick(state);
    const next = structuredClone(result.state);
    const today = toDayNumber(next.clock.date);
    const deadlineDay = today + 30;
    next.progress.challenge = {
      id: CHALLENGE_ID,
      offeredDay: today,
      deadlineDay,
      accepted: false,
      baseline: 0,
    };
    const offered = { type: 'challengeOffered' as const, challengeId: CHALLENGE_ID, deadlineDay };
    return { ...result, state: next, events: [...result.events, offered] };
  });
}

describe('GameSession, automatic pause', () => {
  let frames: FrameRequestCallback[] = [];
  let now = 0;

  /** Runs one animation frame, `ms` after the previous one. */
  function frame(ms: number) {
    now += ms;
    const pending = frames;
    frames = [];
    for (const callback of pending) callback(now);
  }

  beforeEach(() => {
    frames = [];
    now = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function pausedSession() {
    const session = new GameSession(newState(), () => {}, {
      realSecondsPerGameDay: 2.4,
      initialSpeed: 2,
    });
    offerChallengeOnNextTick();
    session.start();
    frame(0);
    frame(200);
    expect(session.getSnapshot()).toMatchObject({ speed: 0, autoPaused: true });
    return session;
  }

  it('goes back to the former speed once the decision is answered', () => {
    const session = pausedSession();
    session.dispatch({ type: 'challenge/answer', accept: false });
    expect(session.getSnapshot()).toMatchObject({ speed: 2, autoPaused: false });
  });

  it('keeps the pause while the decision waits', () => {
    const session = pausedSession();
    session.dispatch({ type: 'inbox/seeNews' });
    expect(session.getSnapshot()).toMatchObject({ speed: 0, autoPaused: true });
  });

  it('keeps the speed the player chose during the pause', () => {
    const session = pausedSession();
    session.setSpeed(0);
    session.dispatch({ type: 'challenge/answer', accept: false });
    expect(session.getSnapshot().speed).toBe(0);
  });
});
