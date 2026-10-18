import { describe, expect, it } from 'vitest';
import { advanceToNextMonth, content, defaultOptions, engine, newGame } from '../test/helpers.ts';
import type { GameEvent } from './events.ts';
import { toCents } from './money.ts';
import { FORMAT_VERSION } from './state.ts';
import { expectedSalary, livingCosts } from './systems/household.ts';

function eventTypes(events: GameEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('createGame', () => {
  it('applies the starting conditions from content', () => {
    const state = newGame();
    expect(state.formatVersion).toBe(FORMAT_VERSION);
    expect(state.clock).toEqual({ date: defaultOptions.startDate, hour: 8, elapsedHours: 0 });
    expect(state.player).toMatchObject({
      jobId: content.start.defaultJobId,
      employed: true,
      balance: toCents(content.start.savings),
      monthlyRent: toCents(content.start.monthlyRent),
    });
    expect(Object.keys(state.banks).sort()).toEqual(content.banks.map((b) => b.id).sort());
    expect(state.loans).toEqual([]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('rejects invalid options', () => {
    expect(() => newGame({ seed: -1 })).toThrow(RangeError);
    expect(() => newGame({ startDate: { year: 2026, month: 2, day: 30 } })).toThrow(RangeError);
    expect(() => newGame({ startHour: 24 })).toThrow(RangeError);
    expect(() => newGame({ jobId: 'astronaut' })).toThrow(RangeError);
  });
});

describe('tick', () => {
  it('advances one hour without mutating the previous state', () => {
    const state = newGame();
    const snapshot = JSON.parse(JSON.stringify(state)) as typeof state;
    const { state: next, events } = engine.tick(state);
    expect(state).toEqual(snapshot);
    expect(next.clock.hour).toBe(9);
    expect(events).toEqual([]);
  });

  it('detects days, weekends, months and years', () => {
    const game = newGame({ startDate: { year: 2026, month: 12, day: 31 } });
    const { events } = engine.advanceHours(game, 16);
    // 2027-01-01 is a Friday.
    expect(eventTypes(events).slice(0, 3)).toEqual(['dayStarted', 'monthStarted', 'yearStarted']);
    const saturday = engine.advanceHours(game, 16 + 24).events;
    expect(eventTypes(saturday)).toContain('weekendStarted');
  });

  it('counts calendar events over a leap year', () => {
    const game = newGame({ startDate: { year: 2027, month: 12, day: 31 }, startHour: 0 });
    const { events } = engine.advanceHours(game, 366 * 24);
    const count = (type: string) => events.filter((e) => e.type === type).length;
    expect(count('dayStarted')).toBe(366);
    expect(count('monthStarted')).toBe(12);
    expect(count('monthlyStatement')).toBe(12);
    expect(count('yearStarted')).toBe(1);
    // 2028 starts on a Saturday and is a leap year: 53 Saturdays.
    expect(count('weekendStarted')).toBe(53);
  });
});

describe('household', () => {
  it('pays salary, rent and living costs on the first of the month', () => {
    const state = newGame();
    const { state: next, events } = advanceToNextMonth(state);
    const statement = events.find((e) => e.type === 'monthlyStatement');
    expect(statement?.type === 'monthlyStatement' && statement.lines.map((l) => l.kind)).toEqual([
      'salary',
      'rent',
      'livingCosts',
    ]);
    const salary = expectedSalary(content, state.player);
    const savings = salary - state.player.monthlyRent - livingCosts(content, state.player);
    expect(next.player.balance - state.player.balance).toBe(savings);
  });

  it('keeps salary savings small for every job', () => {
    for (const job of content.jobs) {
      const { player } = newGame({ jobId: job.id });
      const savings =
        expectedSalary(content, player) - player.monthlyRent - livingCosts(content, player);
      expect(savings, job.id).toBeGreaterThanOrEqual(toCents(100));
      expect(savings, job.id).toBeLessThanOrEqual(toCents(250));
    }
  });

  it('pays variable salaries around their average', () => {
    let state = newGame({ jobId: 'salesperson' });
    const salaries: number[] = [];
    for (let month = 0; month < 120; month++) {
      const result = advanceToNextMonth(state);
      state = result.state;
      for (const event of result.events) {
        if (event.type !== 'monthlyStatement') continue;
        for (const line of event.lines) if (line.kind === 'salary') salaries.push(line.amount);
      }
    }
    const mean = salaries.reduce((a, b) => a + b, 0) / salaries.length;
    expect(Math.min(...salaries)).toBeGreaterThanOrEqual(toCents(2000));
    expect(Math.abs(mean - toCents(2700))).toBeLessThan(toCents(100));
  });

  it('gives free time by job and calendar', () => {
    // Monday 2026-10-19, then Saturday 2026-10-24.
    const civil = newGame();
    expect(engine.advanceHours(civil, 16).state.player.freeTimeMinutes).toBe(150);
    expect(engine.advanceHours(civil, 16 + 5 * 24).state.player.freeTimeMinutes).toBe(360);
    // Nurse cycle from the first day: work, work, rest, rest.
    const nurse = newGame({ jobId: 'nurse' });
    const minutes = [1, 2, 3, 4].map(
      (day) => engine.advanceHours(nurse, 16 + (day - 1) * 24).state.player.freeTimeMinutes,
    );
    expect(minutes).toEqual([0, 420, 420, 0]);
  });

  it('prorates the free time of the first day', () => {
    expect(newGame({ startHour: 12 }).player.freeTimeMinutes).toBe(180); // Sunday: 6 h / 2
  });

  it('stops the salary after resigning', () => {
    const state = newGame();
    const resigned = engine.dispatch(state, { type: 'job/resign' });
    expect(resigned.ok).toBe(true);
    if (!resigned.ok) return;
    expect(engine.dispatch(resigned.state, { type: 'job/resign' })).toMatchObject({
      ok: false,
      reason: { code: 'job.alreadyResigned' },
    });
    const { state: next, events } = advanceToNextMonth(resigned.state);
    const statement = events.find((e) => e.type === 'monthlyStatement');
    expect(statement?.type === 'monthlyStatement' && statement.lines.map((l) => l.kind)).toEqual([
      'rent',
      'livingCosts',
    ]);
    expect(next.player.balance).toBe(
      state.player.balance - state.player.monthlyRent - toCents(content.livingCosts.minimum),
    );
    expect(next.player.freeTimeMinutes).toBe(content.unemployedFreeTimeMinutes);
  });
});
