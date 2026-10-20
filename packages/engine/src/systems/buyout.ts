import type { GameContent } from '../content.ts';
import type { Cents } from '../money.ts';
import { hashFloat } from '../random.ts';
import type { GameState, Lease, OwnedProperty } from '../state.ts';
import type { SystemContext } from './context.ts';
import { giveNotice } from './leases.ts';
import { clampSatisfaction } from './leases.ts';
import type { RentRefusal } from './renting.ts';
import { findOwned } from './renting.ts';
import { spendFreeTime } from './travel.ts';

/**
 * A tenant leaving for an indemnity (« départ négocié », docs/03-systemes/04), and the
 * discount buyers apply to a property sold with its tenant (feedback after milestone 8).
 */

const DAYS_PER_MONTH = 30;

/**
 * Months of rent the tenant would take to leave: drawn once per lease from a stable hash
 * (no draw in the game's generator), less for an unhappy tenant, more for one attached to
 * his home. Hidden from the player; null if this lease has no negotiated departure.
 */
export function buyoutAskMonths(
  content: GameContent,
  state: GameState,
  owned: OwnedProperty,
  lease: Lease,
): number | null {
  const range = content.renting.leaseTypes[lease.leaseType].buyoutMonths;
  if (!range) return null;
  const rules = content.renting.buyout;
  const draw = hashFloat(state.seed, `buyout#${owned.property.id}#${lease.startDay}`);
  let months = range.min + draw * (range.max - range.min);
  if (lease.satisfaction < rules.unhappyBelow) months *= rules.unhappyFactor;
  if (rules.attachedProfiles.includes(lease.tenant.profileId)) months *= rules.attachedFactor;
  return months;
}

/** Day from which the player may make a new offer (after a refusal). */
export function buyoutRetryDay(content: GameContent, lease: Lease): number | null {
  return lease.buyoutRefusedDay === null
    ? null
    : lease.buyoutRefusedDay + content.renting.buyout.retryDays;
}

/**
 * The player offers `amount` for the tenant to leave: one meeting (free time); accepted if
 * it reaches what the tenant hides, the tenant then leaves a month later and the player's
 * reputation suffers a little; refused, the tenant is vexed and waits before listening again.
 * The indemnity is not deductible from the rents (simplification).
 */
export function offerBuyout(
  ctx: SystemContext,
  propertyId: string,
  amount: Cents,
): RentRefusal | null {
  const { content, state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  const lease = owned.lease;
  if (!lease) return 'rent.noLease';
  const ask = buyoutAskMonths(content, state, owned, lease);
  if (ask === null) return 'rent.noBuyout';
  if (lease.noticeEndDay !== null) return 'rent.alreadyLeaving';
  if (!Number.isInteger(amount) || amount <= 0) return 'rent.invalidRent';
  const retry = buyoutRetryDay(content, lease);
  if (retry !== null && ctx.today < retry) return 'rent.buyoutTooSoon';
  if (state.player.balance < amount) return 'account.insufficientFunds';
  const rules = content.renting.buyout;
  if (!spendFreeTime(ctx, rules.minutes, owned.property.cityId)) return 'time.notEnoughFreeTime';
  const accepted = amount >= Math.round(ask * lease.monthlyRent);
  ctx.events.push({ type: 'buyoutAnswered', propertyId, amount, accepted });
  if (!accepted) {
    lease.satisfaction = clampSatisfaction(lease.satisfaction - rules.refusalSatisfaction);
    lease.buyoutRefusedDay = ctx.today;
    return null;
  }
  state.player.balance -= amount;
  state.player.reputation = Math.max(0, state.player.reputation - rules.reputationPenalty);
  giveNotice(ctx, owned, lease, 'buyout', rules.leaveAfterDays / DAYS_PER_MONTH);
  return null;
}

/** Share buyers take off the price of a property sold with its tenant, 0 when vacant. */
export function occupiedDiscount(content: GameContent, owned: OwnedProperty, today: number) {
  const lease = owned.lease;
  // A tenant on the way out leaves the property vacant for the buyer.
  if (!lease || lease.noticeEndDay !== null) return 0;
  const monthsLeft = Math.max(0, (lease.termDay - today) / DAYS_PER_MONTH);
  const lines = [...content.renting.leaseTypes[lease.leaseType].occupiedSaleDiscounts].sort(
    (a, b) => b.minMonthsLeft - a.minMonthsLeft,
  );
  return lines.find((line) => monthsLeft >= line.minMonthsLeft)?.share ?? 0;
}
