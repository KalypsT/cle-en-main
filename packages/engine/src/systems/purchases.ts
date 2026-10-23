import { findBank } from '../content.ts';
import type { Cents } from '../money.ts';
import type { Defect, Listing, LoanApplication, Purchase } from '../state.ts';
import {
  evaluateLoan,
  grantLoan,
  notaryFees,
  type LoanOffer,
  type LoanRequest,
  recordRefusedApplication,
} from './banking.ts';
import type { SystemContext } from './context.ts';
import { freezeItems, itemId } from './dwelling.ts';
import { removeListing } from './listings.ts';
import { monthsToDays } from './renting.ts';
import { estimateValue } from './valuation.ts';

export type PurchaseRefusal =
  | 'purchase.unknown'
  | 'purchase.loanDeadlinePassed'
  | 'purchase.loanAlreadyChosen'
  | 'purchase.applicationPending'
  | 'purchase.unknownApplication'
  | 'purchase.applicationNotGranted'
  | 'purchase.binding'
  | 'bank.unknown'
  | 'loan.invalidAmount';

/** Notary fees, plus bank fees when a loan finances the purchase. */
export function purchaseFees(
  ctx: Pick<SystemContext, 'content'>,
  price: Cents,
  withLoan: boolean,
): { notary: Cents; bank: Cents } {
  const rules = ctx.content.credit;
  return {
    notary: notaryFees(ctx.content, price),
    bank: withLoan ? Math.round(price * rules.bankFeesShare) : 0,
  };
}

/** The accepted offer becomes a compromis: deposit paid, loan condition running. */
export function signCompromis(ctx: SystemContext, listing: Listing, price: Cents): void {
  const { content, state } = ctx;
  const rules = content.market.purchase;
  const deposit = Math.round(price * rules.depositShare);
  if (state.player.balance < deposit) {
    // The seller keeps the listing online.
    ctx.events.push({ type: 'compromisImpossible', listingId: listing.id, deposit });
    return;
  }
  removeListing(ctx, listing.id);
  state.player.balance -= deposit;
  const purchase: Purchase = {
    id: `purchase-${state.nextId++}`,
    holder: 'player',
    listingId: listing.id,
    property: { ...listing.property },
    price,
    deposit,
    signedDay: ctx.today,
    loanDeadlineDay: ctx.today + rules.loanConditionDays,
    deedDay: ctx.today + rules.deedDelayDays,
    applications: [],
    acceptedApplicationId: null,
    cash: false,
  };
  state.purchases.push(purchase);
  ctx.events.push({
    type: 'compromisSigned',
    purchaseId: purchase.id,
    listingId: listing.id,
    price,
    deposit,
    loanDeadlineDay: purchase.loanDeadlineDay,
    deedDay: purchase.deedDay,
  });
}

/** What the bank is asked: the player's cash covers the rest, fees first. */
export function loanRequestFor(
  ctx: SystemContext,
  purchase: Purchase,
  bankId: string,
  amount: Cents,
  durationYears: number,
  works: Cents = 0,
): LoanRequest {
  const fees = purchaseFees(ctx, purchase.price, true);
  const cash = Math.max(0, ctx.state.player.balance) + purchase.deposit;
  const needed = purchase.price + works + fees.notary + fees.bank - amount;
  return {
    bankId,
    amount,
    durationYears,
    price: purchase.price,
    works,
    contribution: Math.min(cash, needed),
    holder: purchase.holder,
    propertyId: purchase.id,
  };
}

function answerApplication(ctx: SystemContext, purchase: Purchase, application: LoanApplication) {
  const request = loanRequestFor(
    ctx,
    purchase,
    application.bankId,
    application.amount,
    application.durationYears,
    application.works,
  );
  const decision = evaluateLoan(ctx.content, ctx.state, request);
  application.decision = decision;
  if (decision.decision === 'refused') recordRefusedApplication(ctx, application.bankId);
  ctx.events.push({
    type: 'loanAnswered',
    purchaseId: purchase.id,
    applicationId: application.id,
    bankId: application.bankId,
    decision: decision.decision,
    ...(decision.decision === 'refused'
      ? { reason: decision.reason }
      : { amount: decision.offer.amount, ratePercent: decision.offer.ratePercent }),
  });
}

function findPurchase(ctx: SystemContext, purchaseId: string): Purchase | undefined {
  return ctx.state.purchases.find((purchase) => purchase.id === purchaseId);
}

export function requestLoan(
  ctx: SystemContext,
  purchaseId: string,
  bankId: string,
  amount: Cents,
  durationYears: number,
  works: Cents = 0,
): PurchaseRefusal | null {
  const purchase = findPurchase(ctx, purchaseId);
  if (!purchase) return 'purchase.unknown';
  if (ctx.today >= purchase.loanDeadlineDay) return 'purchase.loanDeadlinePassed';
  if (purchase.acceptedApplicationId || purchase.cash) return 'purchase.loanAlreadyChosen';
  const bank = findBank(ctx.content, bankId);
  if (!bank) return 'bank.unknown';
  if (!Number.isInteger(amount) || amount <= 0) return 'loan.invalidAmount';
  if (!Number.isInteger(works) || works < 0) return 'loan.invalidAmount';
  if (purchase.applications.some((a) => a.bankId === bankId && a.decision === null)) {
    return 'purchase.applicationPending';
  }
  const application: LoanApplication = {
    id: `application-${ctx.state.nextId++}`,
    bankId,
    amount,
    works,
    durationYears,
    responseDay: ctx.today + bank.responseDelayDays,
    decision: null,
  };
  purchase.applications.push(application);
  ctx.events.push({
    type: 'loanRequested',
    purchaseId,
    applicationId: application.id,
    bankId,
    responseDay: application.responseDay,
  });
  if (bank.responseDelayDays === 0) answerApplication(ctx, purchase, application);
  return null;
}

export function acceptLoan(
  ctx: SystemContext,
  purchaseId: string,
  applicationId: string,
): PurchaseRefusal | null {
  const purchase = findPurchase(ctx, purchaseId);
  if (!purchase) return 'purchase.unknown';
  if (purchase.acceptedApplicationId || purchase.cash) return 'purchase.loanAlreadyChosen';
  if (ctx.today >= purchase.loanDeadlineDay) return 'purchase.loanDeadlinePassed';
  const application = purchase.applications.find((a) => a.id === applicationId);
  if (!application) return 'purchase.unknownApplication';
  if (!application.decision || application.decision.decision === 'refused') {
    return 'purchase.applicationNotGranted';
  }
  purchase.acceptedApplicationId = application.id;
  ctx.events.push({ type: 'loanChosen', purchaseId, applicationId });
  return null;
}

/** Gives up the loan condition: the purchase is paid in cash at the deed. */
export function waiveLoanCondition(ctx: SystemContext, purchaseId: string): PurchaseRefusal | null {
  const purchase = findPurchase(ctx, purchaseId);
  if (!purchase) return 'purchase.unknown';
  if (purchase.acceptedApplicationId || purchase.cash) return 'purchase.loanAlreadyChosen';
  purchase.cash = true;
  return null;
}

/** Withdrawing is free only while the loan condition runs and no loan was chosen. */
export function withdrawPurchase(ctx: SystemContext, purchaseId: string): PurchaseRefusal | null {
  const purchase = findPurchase(ctx, purchaseId);
  if (!purchase) return 'purchase.unknown';
  if (purchase.acceptedApplicationId || purchase.cash || ctx.today >= purchase.loanDeadlineDay) {
    return 'purchase.binding';
  }
  cancelPurchase(ctx, purchase, 'withdrawn', true);
  return null;
}

function cancelPurchase(
  ctx: SystemContext,
  purchase: Purchase,
  reason: 'noLoan' | 'fundsMissing' | 'withdrawn',
  refund: boolean,
) {
  ctx.state.purchases = ctx.state.purchases.filter((p) => p.id !== purchase.id);
  if (refund) ctx.state.player.balance += purchase.deposit;
  ctx.events.push({
    type: 'purchaseCancelled',
    purchaseId: purchase.id,
    reason,
    depositRefunded: refund ? purchase.deposit : 0,
  });
}

function acceptedOffer(purchase: Purchase): LoanOffer | null {
  const application = purchase.applications.find((a) => a.id === purchase.acceptedApplicationId);
  const decision = application?.decision;
  return decision && decision.decision !== 'refused' ? decision.offer : null;
}

/** Part of the accepted loan set aside for the works (the works envelope). */
export function worksEnvelope(purchase: Purchase): Cents {
  const application = purchase.applications.find((a) => a.id === purchase.acceptedApplicationId);
  const offer = acceptedOffer(purchase);
  return offer && application ? Math.min(application.works, offer.amount) : 0;
}

/** Cash the player must hold on the deed day, deposit and loan (works envelope aside) deducted. */
export function cashDueAtDeed(ctx: Pick<SystemContext, 'content'>, purchase: Purchase): Cents {
  const offer = acceptedOffer(purchase);
  const fees = purchaseFees(ctx, purchase.price, offer !== null);
  const lent = (offer?.amount ?? 0) - worksEnvelope(purchase);
  return purchase.price + fees.notary + fees.bank - purchase.deposit - lent;
}

function signDeed(ctx: SystemContext, purchase: Purchase): void {
  const { state } = ctx;
  const offer = acceptedOffer(purchase);
  const due = cashDueAtDeed(ctx, purchase);
  if (state.player.balance < due) {
    // Breach of the compromis: the deposit is kept by the seller.
    cancelPurchase(ctx, purchase, 'fundsMissing', false);
    return;
  }
  const fees = purchaseFees(ctx, purchase.price, offer !== null);
  const loan = offer ? grantLoan(ctx, offer, purchase.property.id) : null;
  const envelope = worksEnvelope(purchase);
  state.player.balance -= purchase.price + fees.notary + fees.bank - purchase.deposit + envelope;
  const discovered = purchase.property.defects.filter((d) => !d.revealed).map((d) => d.id);
  purchase.property.defects = Object.freeze(
    purchase.property.defects.map((defect) => Object.freeze({ ...defect, revealed: true })),
  ) as Defect[];
  // The new owner sees every item.
  const discoveredItems = purchase.property.items.filter((item) => !item.known).map(itemId);
  purchase.property.items = purchase.property.items.map((item) =>
    item.known ? item : { ...item, known: true },
  );
  purchase.property.items = freezeItems(purchase.property.items);
  state.purchases = state.purchases.filter((p) => p.id !== purchase.id);
  state.properties.push({
    property: purchase.property,
    holder: purchase.holder,
    purchasePrice: purchase.price,
    acquisitionCost: purchase.price + fees.notary + fees.bank,
    purchaseDate: { ...state.clock.date },
    sale: null,
    rental: null,
    lease: null,
    furniture: null,
    taxRegime: 'auto',
    furnishedTax: {
      deferredDepreciation: 0,
      deficitCarry: 0,
      buildingDepreciationDeducted: 0,
      works: [],
    },
    quotes: [],
    works: null,
    lastWorks: null,
    worksFund:
      loan && envelope > 0
        ? {
            amount: envelope,
            loanId: loan.id,
            untilDay: ctx.today + monthsToDays(ctx.content.credit.worksEnvelopeMonths),
          }
        : null,
    worksForCapitalGains: 0,
    coproMeeting: null,
    coproCalls: [],
    // The curve starts at the estimate of the deed day.
    valueHistory: [
      {
        date: { ...state.clock.date },
        value: estimateValue(ctx.content, state, purchase.property, true).estimate,
        debt: loan?.remaining ?? 0,
      },
    ],
    log: [],
    rentsReceived: 0,
  });
  ctx.events.push({
    type: 'deedSigned',
    purchaseId: purchase.id,
    propertyId: purchase.property.id,
    price: purchase.price,
    notaryFees: fees.notary,
    bankFees: fees.bank,
    loanId: loan?.id ?? null,
    discoveredDefects: discovered,
    discoveredItems,
    worksEnvelope: envelope,
  });
}

/** Bank answers, end of the loan condition, and deeds, in that order. */
export function runDailyPurchases(ctx: SystemContext): void {
  for (const purchase of [...ctx.state.purchases]) {
    for (const application of purchase.applications) {
      if (application.decision === null && application.responseDay <= ctx.today) {
        answerApplication(ctx, purchase, application);
      }
    }
    if (
      !purchase.acceptedApplicationId &&
      !purchase.cash &&
      ctx.today >= purchase.loanDeadlineDay
    ) {
      cancelPurchase(ctx, purchase, 'noLoan', true);
      continue;
    }
    if (ctx.today >= purchase.deedDay) signDeed(ctx, purchase);
  }
}
