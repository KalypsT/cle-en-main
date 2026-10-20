import type { GameContent } from '../content.ts';
import { type Cents, toCents } from '../money.ts';
import type { GameState, Holder, Loan, OwnedProperty, Property } from '../state.ts';
import type { SystemContext } from './context.ts';
import { believedView, itemRule } from './dwelling.ts';
import { marketRent } from './renting.ts';

/**
 * The SCI (docs/03-systemes/06, milestone 8): a société civile immobilière at the income tax.
 * It shares the player's balance sheet; what changes is who holds a property, how its loans
 * are judged (the property's own rent, not the player's debt ratio) and its taxes.
 */

export type CompanyRefusal =
  | 'company.exists'
  | 'company.none'
  | 'company.leaseType'
  | 'company.noHome'
  | 'purchase.applicationsMade'
  | 'account.insufficientFunds';

export function createCompany(ctx: SystemContext): CompanyRefusal | null {
  const { content, state } = ctx;
  if (state.company) return 'company.exists';
  const cost = toCents(content.company.creationCost);
  if (state.player.balance < cost) return 'account.insufficientFunds';
  state.player.balance -= cost;
  state.company = { createdDay: ctx.today };
  ctx.events.push({ type: 'companyCreated', cost });
  return null;
}

/** Buys in one's own name or through the SCI: decided before asking any bank. */
export function setPurchaseHolder(
  ctx: SystemContext,
  purchaseId: string,
  holder: Holder,
): CompanyRefusal | 'purchase.unknown' | null {
  const { state } = ctx;
  const purchase = state.purchases.find((candidate) => candidate.id === purchaseId);
  if (!purchase) return 'purchase.unknown';
  if (holder === 'company' && !state.company) return 'company.none';
  if (purchase.applications.length > 0 || purchase.acceptedApplicationId || purchase.cash) {
    return 'purchase.applicationsMade';
  }
  purchase.holder = holder;
  ctx.events.push({ type: 'purchaseHolderSet', purchaseId, holder });
  return null;
}

export function heldByCompany(owned: OwnedProperty | undefined): boolean {
  return owned?.holder === 'company';
}

/** A loan of a property the SCI holds. */
export function isCompanyLoan(state: GameState, loan: Loan): boolean {
  if (loan.propertyId === null) return false;
  return heldByCompany(state.properties.find((owned) => owned.property.id === loan.propertyId));
}

/** What the SCI still owes. */
export function companyDebt(state: GameState): Cents {
  return state.loans.reduce(
    (sum, loan) => sum + (isCompanyLoan(state, loan) ? loan.remaining : 0),
    0,
  );
}

/**
 * Monthly bare rent a bank counts for a property bought through the SCI: what the player can
 * tell of it, or, with works in the loan, as if its items were renovated to `renovatedState`.
 */
export function potentialRent(
  content: GameContent,
  state: GameState,
  property: Property,
  withWorks: boolean,
): Cents {
  const believed = believedView(content, property);
  if (!withWorks) return marketRent(content, state, believed, 'bare');
  const floor = content.company.credit.renovatedState;
  const items = believed.items.map((item) =>
    itemRule(content, item.kind).works && item.state < floor ? { ...item, state: floor } : item,
  );
  return marketRent(content, state, { ...believed, items }, 'bare');
}

/** The SCI as the « Banque et SCI » screen shows it (read-only). */
export interface CompanySheet {
  createdDay: number | null;
  creationCost: Cents;
  /** Properties it holds, their rents and the loans' payments, per month. */
  properties: number;
  monthlyRent: Cents;
  monthlyPayments: Cents;
  debt: Cents;
  /** Most its debts may reach (a multiple of the player's net worth), and what is left. */
  ceiling: Cents;
  headroom: Cents;
  /** Yearly fees of its accountant. */
  accountantFees: Cents;
  /** Rules of its loans: rent share counted, contributions asked. */
  rentCoverageShare: number;
  feesContributionShare: number;
  extraContributionShare: number;
}

export function companySheet(
  content: GameContent,
  state: GameState,
  netWorth: Cents,
  accountantFees: Cents,
): CompanySheet {
  const held = state.properties.filter((owned) => owned.holder === 'company');
  const ids = new Set(held.map((owned) => owned.property.id));
  const loans = state.loans.filter((loan) => loan.propertyId !== null && ids.has(loan.propertyId));
  const debt = loans.reduce((sum, loan) => sum + loan.remaining, 0);
  const rules = content.company.credit;
  const ceiling = Math.round(rules.maxLeverage * Math.max(0, netWorth));
  return {
    createdDay: state.company?.createdDay ?? null,
    creationCost: toCents(content.company.creationCost),
    properties: held.length,
    monthlyRent: held.reduce((sum, owned) => sum + (owned.lease?.monthlyRent ?? 0), 0),
    monthlyPayments: loans.reduce((sum, loan) => sum + loan.monthlyPayment, 0),
    debt,
    ceiling,
    headroom: Math.max(0, ceiling - debt),
    accountantFees,
    rentCoverageShare: rules.rentCoverageShare,
    feesContributionShare: rules.feesContributionShare,
    extraContributionShare: rules.extraContributionShare,
  };
}
