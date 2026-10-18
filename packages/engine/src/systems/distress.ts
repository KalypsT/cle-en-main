import { clampTrust } from './banking.ts';
import type { SystemContext } from './context.ts';
import { netWorth } from './net-worth.ts';
import { transferProperty } from './resale.ts';
import { realValue } from './valuation.ts';

/**
 * Descent towards bankruptcy (docs/02, section 2.6), after the overdraft and
 * the credit freeze: past a number of days in overdraft, the bank sells
 * properties at a discount until the account is back above zero. If no
 * property is left and the net worth is still negative, the player is
 * bankrupt. The fresh start of the Classique mode arrives with milestone 6.
 */
export function runDailyDistress(ctx: SystemContext): void {
  const { content, state } = ctx;
  const { player } = state;
  const rules = content.credit.distress;
  if (player.bankruptDay !== null || player.overdraftDays < rules.forcedSaleAfterOverdraftDays) {
    return;
  }
  // The bank sells first what brings the most cash; sales already agreed run their course.
  const candidates = state.properties
    .filter((owned) => !owned.sale?.agreement)
    .map((owned) => {
      const price = Math.round(
        realValue(content, state, owned.property).value * (1 - rules.forcedSaleDiscount),
      );
      const debt = state.loans
        .filter((loan) => loan.propertyId === owned.property.id)
        .reduce((sum, loan) => sum + loan.remaining, 0);
      return { owned, price, equity: price - debt };
    })
    .sort((a, b) => b.equity - a.equity);
  for (const { owned, price } of candidates) {
    if (player.balance >= 0) break;
    const proceeds = transferProperty(ctx, owned, price);
    const relation = state.banks[content.start.accountBankId];
    if (relation) relation.trust = clampTrust(relation.trust + rules.forcedSaleTrust);
    ctx.events.push({ type: 'forcedSale', propertyId: owned.property.id, price, ...proceeds });
  }
  if (player.balance >= 0) {
    player.overdraftDays = 0;
    ctx.events.push({ type: 'overdraftEnded' });
    return;
  }
  const pendingSales = state.properties.some((owned) => owned.sale?.agreement);
  const worth = netWorth(content, state);
  if (!pendingSales && state.properties.length === 0 && worth < 0) {
    player.bankruptDay = ctx.today;
    ctx.events.push({ type: 'bankrupt', netWorth: worth });
  }
}
