import { describe, expect, it } from 'vitest';
import { content, newGame, systemContext } from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import { evaluateLoan, requiredContribution } from './banking.ts';
import { crisisFactor, expireCrises, startCrisis } from './crises.ts';

describe('lasting national crises (milestone 8)', () => {
  it('are in the catalogue, rare and major', () => {
    for (const id of ['recession', 'constructionCrisis', 'creditCrunch']) {
      const event = content.events.find((e) => e.id === id);
      expect(event).toMatchObject({ family: 'france', major: true });
      expect(event?.effects?.some((effect) => effect.type === 'crisis')).toBe(true);
    }
  });

  it('set a factor for some months, multiply when they pile up, then end', () => {
    const ctx = systemContext(newGame());
    expect(crisisFactor(ctx.state, 'unpaidRents')).toBe(1);
    startCrisis(ctx, 'unpaidRents', 1.8, 12);
    startCrisis(ctx, 'unpaidRents', 1.5, 1);
    expect(crisisFactor(ctx.state, 'unpaidRents')).toBeCloseTo(2.7);
    expect(crisisFactor(ctx.state, 'worksCosts')).toBe(1);
    // Two months later, the short one is over.
    const later = { ...ctx.state.clock.date, month: ctx.state.clock.date.month + 2 };
    ctx.state.clock.date =
      later.month > 12 ? { ...later, year: later.year + 1, month: later.month - 12 } : later;
    ctx.today = toDayNumber(ctx.state.clock.date);
    expect(crisisFactor(ctx.state, 'unpaidRents')).toBeCloseTo(1.8);
    expireCrises(ctx);
    expect(ctx.state.market.crises).toHaveLength(1);
  });

  it('tightens the banks during a credit crunch', () => {
    const ctx = systemContext(newGame());
    const price = 140_000_00;
    const request = {
      bankId: 'tirelire',
      amount: price,
      durationYears: 20,
      price,
      works: 0,
      contribution: requiredContribution(content, price),
    };
    const before = evaluateLoan(content, ctx.state, request);
    startCrisis(ctx, 'credit', 0.5, 18);
    const during = evaluateLoan(content, ctx.state, request);
    expect(before.decision).not.toBe('refused');
    expect(during.decision).toBe('refused');
  });
});
