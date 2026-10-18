import { describe, expect, it } from 'vitest';
import {
  affordableListing,
  buyWithLoan,
  content,
  newGame,
  systemContext,
} from '../../test/helpers.ts';
import type { GameState } from '../state.ts';
import { runDailyDistress } from './distress.ts';
import { realValue } from './valuation.ts';

function ownerInOverdraft(balance: number): GameState {
  const start = newGame({ seed: 99 });
  const { state } = buyWithLoan(start, affordableListing(start).id);
  return {
    ...state,
    player: {
      ...state.player,
      balance,
      overdraftDays: content.credit.distress.forcedSaleAfterOverdraftDays,
    },
  };
}

describe('descent towards bankruptcy', () => {
  it('waits until the overdraft has lasted long enough', () => {
    const state = ownerInOverdraft(-100_000);
    const ctx = systemContext({
      ...state,
      player: { ...state.player, overdraftDays: state.player.overdraftDays - 1 },
    });
    runDailyDistress(ctx);
    expect(ctx.events).toEqual([]);
    expect(ctx.state.properties).toHaveLength(1);
  });

  it('forces the sale of a property at a discount and repays its loan', () => {
    const state = ownerInOverdraft(-100_000);
    const owned = state.properties[0];
    if (!owned) throw new Error('No property');
    const ctx = systemContext(state);
    const trustBefore = state.banks[content.start.accountBankId]?.trust ?? 0;
    const value = realValue(content, state, owned.property).value;
    runDailyDistress(ctx);
    const sale = ctx.events.find((e) => e.type === 'forcedSale');
    if (sale?.type !== 'forcedSale') throw new Error('No forced sale');
    expect(sale.price).toBe(Math.round(value * (1 - content.credit.distress.forcedSaleDiscount)));
    expect(ctx.state.properties).toEqual([]);
    expect(ctx.state.loans).toEqual([]);
    expect(ctx.state.banks[content.start.accountBankId]?.trust).toBeLessThan(trustBefore);
    // The sale does not cover the loan: bankruptcy, then the Classique fresh start.
    expect(-100_000 + sale.net).toBeLessThan(0);
    expect(ctx.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['forcedSale', 'bankrupt', 'freshStart']),
    );
  });

  it('declares bankruptcy when the net worth stays negative without any property', () => {
    const start = newGame();
    const ctx = systemContext({
      ...start,
      player: {
        ...start.player,
        balance: -500_000,
        overdraftDays: content.credit.distress.forcedSaleAfterOverdraftDays,
      },
    });
    runDailyDistress(ctx);
    expect(ctx.events[0]).toEqual({ type: 'bankrupt', netWorth: -500_000 });
    expect(ctx.state.chronicle.map((entry) => entry.kind)).toContain('bankrupt');
  });

  it('starts again in the same world in Classique mode (docs/02, section 2.6)', () => {
    const start = newGame();
    const classic = content.modes.modes.find((mode) => mode.id === 'classic')?.freshStart;
    const ctx = systemContext({
      ...start,
      player: {
        ...start.player,
        balance: -500_000,
        reputation: 40,
        overdraftDays: content.credit.distress.forcedSaleAfterOverdraftDays,
      },
      progress: {
        ...start.progress,
        titles: [...start.progress.titles, { id: 'firstInvestor', day: 1 }],
      },
    });
    runDailyDistress(ctx);
    expect(ctx.events.at(-1)).toEqual({
      type: 'freshStart',
      savings: (classic?.savings ?? 0) * 100,
      reputation: Math.round(40 * (classic?.reputationShare ?? 0)),
    });
    const { state } = ctx;
    expect(state.player.balance).toBe((classic?.savings ?? 0) * 100);
    expect(state.player.bankruptDay).toBeNull();
    expect(state.player.employed).toBe(true);
    expect(state.loans).toEqual([]);
    expect(state.progress.titles.map((t) => t.id)).toContain('firstInvestor');
    expect(state.progress.counters.freshStarts).toBe(1);
    expect(state.listings).toEqual(start.listings);
    // Only once.
    const again = systemContext(state);
    runDailyDistress(again);
    expect(again.events).toEqual([]);
  });

  it('ends the game in Exigeant mode', () => {
    const start = newGame({ modeId: 'demanding' });
    const ctx = systemContext({
      ...start,
      player: {
        ...start.player,
        balance: -500_000,
        overdraftDays: content.credit.distress.forcedSaleAfterOverdraftDays,
      },
    });
    runDailyDistress(ctx);
    expect(ctx.events.map((e) => e.type)).toEqual(['bankrupt', 'gameOver']);
    expect(ctx.state.gameOver).toEqual({ day: ctx.today });
  });
});
