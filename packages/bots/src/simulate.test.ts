import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.ts';

describe('simulate', () => {
  it('reaches the expected date and is deterministic', () => {
    const options = {
      seed: 5,
      startDate: { year: 2027, month: 1, day: 1 },
      startHour: 8,
      days: 365,
    };
    const result = simulate(options);
    expect(result.state.clock.date).toEqual({ year: 2028, month: 1, day: 1 });
    expect(result.eventCounts.dayStarted).toBe(365);
    expect(result.eventCounts.yearStarted).toBe(1);
    expect(simulate(options)).toEqual(result);
  });

  it('simulates ten years in a few seconds', () => {
    const startedAt = performance.now();
    simulate({ seed: 1, startDate: { year: 2027, month: 1, day: 1 }, startHour: 8, days: 3653 });
    expect(performance.now() - startedAt).toBeLessThan(5000);
  });
});
