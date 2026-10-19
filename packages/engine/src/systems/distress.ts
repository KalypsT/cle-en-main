import { toCents } from '../money.ts';
import { clampTrust } from './banking.ts';
import type { SystemContext } from './context.ts';
import { editableListing } from './listings.ts';
import { modeOf } from './modes.ts';
import { addChronicle } from './progress.ts';
import { netWorth } from './net-worth.ts';
import { transferProperty } from './resale.ts';
import { realValue } from './valuation.ts';

/**
 * Descent towards bankruptcy (docs/02, section 2.6), after the overdraft and
 * the credit freeze: past a number of days in overdraft, the bank sells
 * properties at a discount until the account is back above zero. If no
 * property is left and the net worth is still negative, the player is
 * bankrupt: a fresh start in the same world, or the end of the game,
 * depending on the mode.
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
    ctx.events.push({
      type: 'forcedSale',
      propertyId: owned.property.id,
      cityId: owned.property.cityId,
      price,
      ...proceeds,
    });
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
    addChronicle(ctx, 'bankrupt', null, worth);
    const mode = modeOf(content, state);
    if (mode.freshStart) freshStart(ctx, mode.freshStart);
    else {
      state.gameOver = { day: ctx.today };
      addChronicle(ctx, 'gameOver');
      ctx.events.push({ type: 'gameOver' });
    }
  }
}

/**
 * The fresh start (docs/02, section 2.6): same world, salaried again in his
 * job and renting at the start city, with a small savings. Titles,
 * achievements, chronicle and address book of artisans stay; properties,
 * loans, purchases under way and cash go, and part of the reputation.
 */
export function freshStart(
  ctx: SystemContext,
  rules: { savings: number; reputationShare: number; trustPenalty: number },
): void {
  const { content, state } = ctx;
  const { player } = state;
  player.balance = toCents(rules.savings);
  player.overdraftDays = 0;
  player.overdraftInterestThisMonth = 0;
  player.employed = true;
  player.baseCityId = content.start.cityId;
  player.monthlyRent = toCents(content.start.monthlyRent);
  for (const cityId of Object.keys(player.renown)) {
    player.renown[cityId] = Math.round((player.renown[cityId] ?? 0) * rules.reputationShare);
  }
  player.homePropertyId = null;
  player.rentalHistoryMonths = 0;
  player.bankruptDay = null;
  player.reputation = Math.round(player.reputation * rules.reputationShare);
  state.loans = [];
  state.purchases = [];
  state.properties = [];
  state.agenda = [];
  for (const listing of state.listings) {
    if (listing.offer) editableListing(ctx, listing).offer = null;
  }
  for (const relation of Object.values(state.banks)) {
    relation.trust = clampTrust(relation.trust + rules.trustPenalty);
  }
  state.tax.ledgers = {};
  state.tax.landlordDeficits = [];
  state.tax.installments = { monthly: 0, remaining: 0 };
  state.catalog.pending = [];
  state.progress.challenge = null;
  state.progress.counters.freshStarts = (state.progress.counters.freshStarts ?? 0) + 1;
  state.progress.counters.positiveStreak = 0;
  addChronicle(ctx, 'freshStart', null, player.balance);
  ctx.events.push({ type: 'freshStart', savings: player.balance, reputation: player.reputation });
}
