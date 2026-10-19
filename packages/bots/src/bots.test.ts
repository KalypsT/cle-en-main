import { describe, expect, it } from 'vitest';
import { playGame } from './driver.ts';
import { buildReport, formatReport } from './report.ts';
import { runTasks, seriesTasks } from './series.ts';
import { createStrategy } from './strategies.ts';

const options = {
  seed: 3,
  startDate: { year: 2027, month: 1, day: 1 },
  startHour: 8,
  days: 365,
  jobId: 'developer',
};

describe('bots', () => {
  it('the inactive bot never acts, and its net worth is only its savings', () => {
    const result = playGame(createStrategy('inactif'), options);
    expect(result.purchases + result.visits + result.offers).toBe(0);
    expect(result.finalNetWorth).toBe(result.finalBalance);
  });

  it('the hunter visits, negotiates and buys in its first year, deterministically', () => {
    const result = playGame(createStrategy('chasseur'), options);
    expect(result.visits).toBeGreaterThan(0);
    expect(result.purchases).toBeGreaterThan(0);
    expect(result.firstPurchaseDay).toBeLessThan(365);
    // Milestone 6: the real title, and the density of decisions is measured.
    expect(result.titleDays.firstInvestor).toBe(result.firstPurchaseDay);
    expect(result.decisions).toBeGreaterThan(0);
    expect(result.realSeconds).toBeGreaterThan(0);
    // It lets what it buys, and its first year is assessed on 1 January.
    expect(result.letMonths).toBeGreaterThan(0);
    expect(result.assessedPropertyYears).toBeGreaterThan(0);
    expect(playGame(createStrategy('chasseur'), options)).toEqual(result);
  });

  it('the marchand and the premium renovator play deterministically', () => {
    for (const id of ['marchand', 'renovateur'] as const) {
      const result = playGame(createStrategy(id), options);
      expect(result.bankruptDay).toBeNull();
      expect(playGame(createStrategy(id), options)).toEqual(result);
    }
  });

  it('the naive bot offers without visiting', () => {
    const result = playGame(createStrategy('naif'), options);
    expect(result.visits).toBe(0);
    expect(result.offers).toBeGreaterThan(0);
  });

  it('runs a series on worker threads with the same results as in one thread', async () => {
    const tasks = seriesTasks({
      bots: ['prudent', 'levier'],
      games: 2,
      years: 1,
      firstSeed: 10,
      startDate: options.startDate,
      startHour: 8,
      jobId: null,
      workers: 2,
    });
    expect(tasks.map((task) => [task.botId, task.seed, task.jobId])).toEqual([
      ['prudent', 10, 'civilServant'],
      ['levier', 10, 'civilServant'],
      ['prudent', 11, 'teacher'],
      ['levier', 11, 'teacher'],
    ]);
    const parallel = await runTasks(tasks, 2);
    expect(parallel).toEqual(await runTasks(tasks, 1));
    const report = buildReport(parallel, 1);
    expect(report.summaries.map((s) => s.botId)).toEqual(['prudent', 'levier']);
    expect(report.checks.some((check) => check.label.startsWith('Faillites du Levier'))).toBe(true);
    expect(formatReport(report, 'Test')).toContain('| Levier maximal |');
    expect(formatReport(report, 'Test')).toContain('## Location et fiscalité');
    expect(formatReport(report, 'Test')).toContain('## Rythme et progression');
    expect(report.checks.some((check) => check.label.startsWith('Densité de décisions'))).toBe(
      true,
    );
  }, 60_000);
});
