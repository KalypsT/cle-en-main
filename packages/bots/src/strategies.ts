import type { GameEvent, Listing } from '@cle/engine';
import type { BotApi, Strategy } from './driver.ts';

/**
 * The investor bots of docs/08-equilibrage.md (section 8.2), as profiles of
 * one decision routine. They play only through engine actions and see only
 * what the player sees: estimates, never real values.
 */
export interface InvestorProfile {
  id: string;
  /** Visits a listing before making an offer. */
  visits: boolean;
  /** Visits planned per decision, free time permitting. */
  visitsPerDay: number;
  /** Listings considered: estimate ≥ asking price × this (before any visit). */
  screenRatio: number;
  /** Highest price paid: estimate / this (after the visit). */
  buyRatio: number;
  /** First offer as a share of the asking price (1 = the asking price). */
  firstOfferShare: number;
  /** Picks the best-looking listing, or one at random. */
  pick: 'best' | 'random';
  /** Decides every N days. */
  decisionEveryDays: number;
  /** Cash kept after a purchase: months of loan payments, with a floor (euros). */
  reserveMonths: number;
  reserveMin: number;
  /** Personal money put in beyond the fees, as a share of the price. */
  extraContributionShare: number;
  durationYears: number;
  /** Own ceiling on the debt ratio after the loan (the bank applies its own). */
  maxDebtRatio: number;
  /** Lowest monthly cash flow accepted (net rent − loan payment, euros); null ignores it. */
  minCashFlow: number | null;
  /** Skips properties in ruins, which cannot be let before milestone 3. */
  avoidRuins: boolean;
  /** Banks asked for a loan, in order. */
  banks: string[];
  /** Banks met every month, to build trust. */
  meetBanks: string[];
  /** Accepts a bank's counter-proposal over a longer duration. */
  acceptsLongerLoans: boolean;
}

const OFFER_STEP = 500_00;
const DAYS_PER_MONTH = 30;

interface Plan {
  bankIds: string[];
  amount: number;
  maxPrice: number;
}

interface Memory {
  startDay: number | null;
  maxPrice: Map<string, number>;
  /** Banks still to ask, by purchase id. */
  banksLeft: Map<string, string[]>;
  lastMeeting: Map<string, number>;
}

function roundDown(amount: number): number {
  return Math.floor(amount / OFFER_STEP) * OFFER_STEP;
}

export function investor(profile: InvestorProfile): Strategy {
  const memory: Memory = {
    startDay: null,
    maxPrice: new Map(),
    banksLeft: new Map(),
    lastMeeting: new Map(),
  };

  const feesShare = (api: BotApi) =>
    api.engine.content.credit.notaryFeesShare + api.engine.content.credit.bankFeesShare;

  const payments = (api: BotApi) =>
    api.state.loans.reduce((sum, loan) => sum + loan.monthlyPayment, 0);

  const reserve = (api: BotApi, extraPayment: number) =>
    Math.max(profile.reserveMin * 100, profile.reserveMonths * (payments(api) + extraPayment));

  /**
   * How the bot would finance a purchase at `price`, or null if it cannot or
   * will not. `deposit` is cash already paid at the compromis.
   */
  function plan(api: BotApi, price: number, rentId: string, deposit = 0): Plan | null {
    const { engine, state } = api;
    const fees = Math.round(price * feesShare(api));
    const contribution = fees + Math.round(price * profile.extraContributionShare);
    const amount = price + fees - contribution;
    const cash = state.player.balance + deposit;
    const rent = engine.marketRent(state, rentId)?.net ?? 0;
    const bankIds: string[] = [];
    for (const bankId of profile.banks) {
      const decision = engine.evaluateLoan(state, {
        bankId,
        amount,
        durationYears: profile.durationYears,
        price,
        works: 0,
        contribution: Math.min(cash, contribution),
      });
      if (decision.decision === 'refused' || decision.decision === 'partial') continue;
      if (decision.decision === 'counterOffer' && !profile.acceptsLongerLoans) continue;
      const offer = decision.offer;
      if (offer.debtRatioAfter > profile.maxDebtRatio) continue;
      if (cash - contribution < reserve(api, offer.monthlyPayment)) continue;
      if (profile.minCashFlow !== null) {
        if (rent - offer.monthlyPayment < profile.minCashFlow * 100) continue;
      }
      bankIds.push(bankId);
    }
    return bankIds.length > 0 ? { bankIds, amount, maxPrice: price } : null;
  }

  function meetBanks(api: BotApi): void {
    for (const bankId of profile.meetBanks) {
      const last = memory.lastMeeting.get(bankId);
      if (last !== undefined && api.today - last < DAYS_PER_MONTH) continue;
      if (api.act({ type: 'bank/meet', bankId })) memory.lastMeeting.set(bankId, api.today);
    }
  }

  function offer(api: BotApi, listing: Listing, estimate: number): void {
    const maxPrice =
      profile.buyRatio > 0 ? roundDown(estimate / profile.buyRatio) : listing.askingPrice;
    const share =
      listing.offersMade === 0 ? profile.firstOfferShare : (1 + profile.firstOfferShare) / 2;
    const amount = Math.min(
      maxPrice,
      listing.askingPrice,
      Math.max(OFFER_STEP, roundDown(listing.askingPrice * share)),
    );
    if (!plan(api, Math.min(listing.askingPrice, maxPrice), listing.id)) return;
    if (api.act({ type: 'market/offer', listingId: listing.id, amount })) {
      memory.maxPrice.set(listing.id, Math.min(maxPrice, listing.askingPrice));
    }
  }

  function candidates(api: BotApi) {
    const { engine, state } = api;
    const limit = engine.content.market.negotiation.maxOffersPerListing;
    const result: { listing: Listing; estimate: number; ratio: number }[] = [];
    for (const listing of state.listings) {
      if (listing.offer || listing.offersMade >= limit || api.today < listing.publicDay) continue;
      if (profile.avoidRuins && listing.property.condition === 'ruin') continue;
      const estimate = engine.estimate(state, listing.id)?.estimate ?? 0;
      const ratio = estimate / listing.askingPrice;
      if (ratio < profile.screenRatio) continue;
      result.push({ listing, estimate, ratio });
    }
    return result.sort((a, b) => b.ratio - a.ratio);
  }

  function daily(api: BotApi): void {
    memory.startDay ??= api.today;
    if ((api.today - memory.startDay) % profile.decisionEveryDays !== 0) return;
    meetBanks(api);
    const { state } = api;
    if (state.purchases.length > 0) return;
    if (state.listings.some((listing) => listing.offer)) return;
    const found = candidates(api);
    if (profile.pick === 'random') {
      const affordable = found.filter((c) => plan(api, c.listing.askingPrice, c.listing.id));
      const choice = affordable[Math.floor(api.random() * affordable.length)];
      if (choice) offer(api, choice.listing, choice.estimate);
      return;
    }
    if (!profile.visits) {
      const best = found.find((c) => c.ratio >= profile.buyRatio);
      if (best) offer(api, best.listing, best.estimate);
      return;
    }
    // Offer on the best listing already visited, otherwise visit the most promising ones.
    const visited = found.find((c) => c.listing.visited && c.ratio >= profile.buyRatio);
    if (visited) {
      offer(api, visited.listing, visited.estimate);
      return;
    }
    let planned = 0;
    for (const candidate of found) {
      if (planned >= profile.visitsPerDay) break;
      const { listing } = candidate;
      if (listing.visited || state.agenda.some((item) => item.listingId === listing.id)) continue;
      // Only worth a visit if the bot could finance it at the asking price.
      if (!plan(api, Math.min(listing.askingPrice, candidate.estimate), listing.id)) continue;
      if (!api.act({ type: 'market/visit', listingId: listing.id })) break;
      planned += 1;
    }
  }

  function askNextBank(api: BotApi, purchaseId: string): void {
    const purchase = api.state.purchases.find((p) => p.id === purchaseId);
    if (!purchase) return;
    const banks = memory.banksLeft.get(purchaseId) ?? [];
    while (banks.length > 0) {
      const bankId = banks.shift();
      if (!bankId) break;
      const financing = plan(api, purchase.price, purchaseId, purchase.deposit);
      const amount = financing?.amount ?? purchase.price;
      if (
        api.act({
          type: 'purchase/requestLoan',
          purchaseId,
          bankId,
          amount,
          durationYears: profile.durationYears,
        })
      ) {
        return;
      }
    }
    api.act({ type: 'purchase/withdraw', purchaseId });
  }

  function onLoanAnswer(api: BotApi, event: Extract<GameEvent, { type: 'loanAnswered' }>): void {
    const purchase = api.state.purchases.find((p) => p.id === event.purchaseId);
    if (!purchase || purchase.acceptedApplicationId) return;
    const application = purchase.applications.find((a) => a.id === event.applicationId);
    const decision = application?.decision;
    if (decision && decision.decision !== 'refused') {
      const longer = decision.decision === 'counterOffer';
      const fees = Math.round(purchase.price * feesShare(api));
      const due = purchase.price + fees - purchase.deposit - decision.offer.amount;
      const keeps = api.state.player.balance - due >= reserve(api, decision.offer.monthlyPayment);
      if (
        (!longer || profile.acceptsLongerLoans) &&
        decision.offer.debtRatioAfter <= profile.maxDebtRatio &&
        keeps &&
        api.act({
          type: 'purchase/acceptLoan',
          purchaseId: purchase.id,
          applicationId: event.applicationId,
        })
      ) {
        memory.banksLeft.delete(purchase.id);
        return;
      }
    }
    askNextBank(api, purchase.id);
  }

  function onEvent(api: BotApi, event: GameEvent): void {
    switch (event.type) {
      case 'compromisSigned': {
        const purchase = api.state.purchases.find((p) => p.id === event.purchaseId);
        if (!purchase) return;
        const financing = plan(api, purchase.price, purchase.id, purchase.deposit);
        memory.banksLeft.set(purchase.id, financing ? [...financing.bankIds] : [...profile.banks]);
        askNextBank(api, purchase.id);
        return;
      }
      case 'loanAnswered':
        onLoanAnswer(api, event);
        return;
      case 'offerAnswered': {
        if (event.answer !== 'counterOffer') return;
        const maxPrice = memory.maxPrice.get(event.listingId) ?? 0;
        api.act({
          type: 'market/answerCounter',
          listingId: event.listingId,
          accept: event.amount <= maxPrice && plan(api, event.amount, event.listingId) !== null,
        });
        return;
      }
      default:
        return;
    }
  }

  return { id: profile.id, daily, onEvent };
}

const BANKS_BY_RATE = ['rigueur', 'tirelire', 'zeroPapier', 'fougueux'];

export const PROFILES = {
  prudent: {
    id: 'prudent',
    visits: true,
    visitsPerDay: 1,
    screenRatio: 1,
    buyRatio: 1.05,
    firstOfferShare: 0.94,
    pick: 'best',
    decisionEveryDays: 1,
    reserveMonths: 6,
    reserveMin: 3000,
    extraContributionShare: 0.03,
    durationYears: 20,
    maxDebtRatio: 0.3,
    minCashFlow: 0,
    avoidRuins: true,
    banks: BANKS_BY_RATE,
    meetBanks: ['tirelire'],
    acceptsLongerLoans: false,
  },
  levier: {
    id: 'levier',
    visits: true,
    visitsPerDay: 1,
    screenRatio: 0.98,
    buyRatio: 0.98,
    firstOfferShare: 0.97,
    pick: 'best',
    decisionEveryDays: 1,
    reserveMonths: 0,
    reserveMin: 0,
    extraContributionShare: 0,
    durationYears: 25,
    maxDebtRatio: 1,
    minCashFlow: null,
    avoidRuins: true,
    banks: ['fougueux', 'tirelire', 'zeroPapier', 'rigueur'],
    meetBanks: ['fougueux', 'tirelire'],
    acceptsLongerLoans: true,
  },
  naif: {
    id: 'naif',
    visits: false,
    visitsPerDay: 0,
    screenRatio: 0,
    buyRatio: 0,
    firstOfferShare: 1,
    pick: 'random',
    decisionEveryDays: 7,
    reserveMonths: 0,
    reserveMin: 1000,
    extraContributionShare: 0,
    durationYears: 25,
    maxDebtRatio: 1,
    minCashFlow: null,
    avoidRuins: false,
    banks: ['tirelire', 'fougueux', 'zeroPapier'],
    meetBanks: [],
    acceptsLongerLoans: true,
  },
  chasseur: {
    id: 'chasseur',
    visits: true,
    visitsPerDay: 4,
    screenRatio: 1.03,
    buyRatio: 1.1,
    firstOfferShare: 0.92,
    pick: 'best',
    decisionEveryDays: 1,
    reserveMonths: 3,
    reserveMin: 3000,
    extraContributionShare: 0,
    durationYears: 25,
    maxDebtRatio: 0.35,
    minCashFlow: -50,
    avoidRuins: true,
    banks: BANKS_BY_RATE,
    meetBanks: ['tirelire'],
    acceptsLongerLoans: false,
  },
} as const satisfies Record<string, InvestorProfile>;

export const inactive: Strategy = { id: 'inactif' };

export type BotId = keyof typeof PROFILES | 'inactif';
export const BOT_IDS: readonly BotId[] = ['prudent', 'levier', 'naif', 'chasseur', 'inactif'];

export const BOT_NAMES: Record<BotId, string> = {
  prudent: 'Prudent',
  levier: 'Levier maximal',
  naif: 'Naïf',
  chasseur: 'Chasseur de bonnes affaires',
  inactif: 'Inactif',
};

/** A fresh strategy (bots keep a little memory: one per game). */
export function createStrategy(id: BotId): Strategy {
  if (id === 'inactif') return inactive;
  const profile: InvestorProfile = { ...PROFILES[id], banks: [...PROFILES[id].banks] };
  return investor({ ...profile, meetBanks: [...PROFILES[id].meetBanks] });
}
