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
    expect(ctx.state.player.balance).toBe(-100_000 + sale.net);
    expect(ctx.state.banks[content.start.accountBankId]?.trust).toBeLessThan(trustBefore);
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
    expect(ctx.events).toEqual([{ type: 'bankrupt', netWorth: -500_000 }]);
    expect(ctx.state.player.bankruptDay).toBe(ctx.today);
    // Only once.
    const again = systemContext(ctx.state);
    runDailyDistress(again);
    expect(again.events).toEqual([]);
  });
});
