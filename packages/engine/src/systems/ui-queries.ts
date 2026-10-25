import { type CalendarDate, fromDayNumber, toDayNumber } from '../calendar.ts';
import {
  type Condition,
  findAgency,
  findBank,
  findCity,
  findNeighbourhood,
  type DecisionKind,
  type GameContent,
} from '../content.ts';
import { annuityPayment, type Cents, toCents } from '../money.ts';
import { hashFloat } from '../random.ts';
import type { GameState, Holder, OwnedProperty, Property } from '../state.ts';
import {
  evaluateLoan,
  type LoanDecision,
  worthyRefinance,
  quoteRate,
  type RateQuote,
  requiredContribution,
} from './banking.ts';
import { believedView, conditionLabel } from './dwelling.ts';
import { netWorth } from './net-worth.ts';
import { dwellingKindOf, type Estimate, estimateValue } from './valuation.ts';
import { isRemoteSelfManaged, remoteManagementFee } from './cities.ts';
import { monthlyStatementEstimate } from './outlook.ts';
import { purchaseFees } from './purchases.ts';
import { cashDueAtDeed } from './purchases.ts';
import {
  letBanDay,
  lettingBlock,
  monthsToDays,
  ownerInsurance,
  recoverableCharges,
  rentRange,
} from './renting.ts';

/**
 * Read-only views for the interface (docs/04): what waits for the player,
 * what each property brings, what a purchase would cost, where things are on
 * the map. The interface computes nothing itself.
 */

const MONTHS_PER_YEAR = 12;

/** Something waiting for the player, with its deadline (day number; null: none). */
export type PendingDecision = {
  deadlineDay: number | null;
  /** The game pauses when it appears (content/decisions.json). */
  autoPause: boolean;
} & (
  | { kind: 'counterOffer'; listingId: string; amount: Cents }
  | { kind: 'loanNeeded'; purchaseId: string }
  | { kind: 'loanAnswer'; purchaseId: string; applicationIds: string[] }
  | { kind: 'deedFunds'; purchaseId: string; missing: Cents }
  | { kind: 'candidates'; propertyId: string; count: number }
  | {
      kind: 'saleOffer';
      propertyId: string;
      offerId: string;
      amount: Cents;
      buyerId: string | null;
    }
  | { kind: 'worksHazard'; propertyId: string; hazardId: string; cost: Cents }
  | { kind: 'coproVote'; propertyId: string; resolutions: number }
  | { kind: 'incident'; propertyId: string; kindId: string }
  | { kind: 'quoteExpiring'; propertyId: string; quoteId: string; artisanId: string }
  | { kind: 'dpeWarning'; propertyId: string }
  | { kind: 'vacant'; propertyId: string }
  | { kind: 'renegotiation'; loanId: string; bankId: string; ratePercent: number }
  | { kind: 'cashAlert'; lowest: Cents }
  | { kind: 'catalogEvent'; instanceId: string; eventId: string }
  | { kind: 'challengeOffer'; challengeId: string }
);

type DecisionBody = PendingDecision extends infer D
  ? D extends PendingDecision
    ? Omit<D, 'autoPause'>
    : never
  : never;

/** Every decision waiting for the player, the most urgent first. */
export function pendingDecisions(content: GameContent, state: GameState): PendingDecision[] {
  const today = toDayNumber(state.clock.date);
  const list: DecisionBody[] = [];

  for (const listing of state.listings) {
    const counter = listing.offer?.counter;
    if (counter) {
      list.push({
        kind: 'counterOffer',
        listingId: listing.id,
        amount: counter.amount,
        deadlineDay: counter.expiresDay,
      });
    }
  }

  for (const purchase of state.purchases) {
    const chosen = purchase.acceptedApplicationId !== null || purchase.cash;
    if (!chosen) {
      const answered = purchase.applications.filter(
        (application) => application.decision && application.decision.decision !== 'refused',
      );
      const waiting = purchase.applications.some((application) => application.decision === null);
      if (answered.length > 0) {
        list.push({
          kind: 'loanAnswer',
          purchaseId: purchase.id,
          applicationIds: answered.map((application) => application.id),
          deadlineDay: purchase.loanDeadlineDay,
        });
      } else if (!waiting) {
        list.push({
          kind: 'loanNeeded',
          purchaseId: purchase.id,
          deadlineDay: purchase.loanDeadlineDay,
        });
      }
    } else {
      const missing = cashDueAtDeed({ content }, purchase) - state.player.balance;
      if (missing > 0) {
        list.push({
          kind: 'deedFunds',
          purchaseId: purchase.id,
          missing,
          deadlineDay: purchase.deedDay,
        });
      }
    }
  }

  const dpeHorizon = today + monthsToDays(content.renting.dpe.warningMonths);
  for (const owned of state.properties) {
    const propertyId = owned.property.id;
    const applications = owned.rental?.applications ?? [];
    if (applications.length > 0) {
      list.push({
        kind: 'candidates',
        propertyId,
        count: applications.length,
        deadlineDay: Math.min(...applications.map((application) => application.expiresDay)),
      });
    }
    for (const offer of owned.sale?.offers ?? []) {
      if (offer.counterAmount !== null) continue;
      list.push({
        kind: 'saleOffer',
        propertyId,
        offerId: offer.id,
        amount: offer.amount,
        buyerId: offer.buyerId,
        deadlineDay: offer.expiresDay,
      });
    }
    const hazard = owned.works?.hazard;
    if (hazard) {
      list.push({
        kind: 'worksHazard',
        propertyId,
        hazardId: hazard.hazardId,
        cost: hazard.cost,
        deadlineDay: hazard.deadlineDay,
      });
    }
    const meeting = owned.coproMeeting;
    if (meeting && meeting.resolutions.some((resolution) => resolution.vote === null)) {
      list.push({
        kind: 'coproVote',
        propertyId,
        resolutions: meeting.resolutions.length,
        deadlineDay: meeting.voteDay,
      });
    }
    const incident = owned.lease?.incident;
    if (incident && !incident.repair) {
      list.push({
        kind: 'incident',
        propertyId,
        kindId: incident.kindId,
        deadlineDay: incident.day + content.renting.incidentPatienceDays,
      });
    }
    for (const quote of owned.quotes) {
      if (owned.works || quote.expiresDay - today > content.decisions.quoteWarningDays) continue;
      list.push({
        kind: 'quoteExpiring',
        propertyId,
        quoteId: quote.id,
        artisanId: quote.artisanId,
        deadlineDay: quote.expiresDay,
      });
    }
    const ban = letBanDay(content, owned.property.dpe);
    if (
      ban !== null &&
      ban > today &&
      ban <= dpeHorizon &&
      state.player.homePropertyId !== propertyId
    ) {
      list.push({ kind: 'dpeWarning', propertyId, deadlineDay: ban });
    }
    // A plot of land is never let: it is no « empty home » to decide about.
    if (
      !owned.lease &&
      !owned.rental &&
      !owned.works &&
      !owned.sale &&
      state.player.homePropertyId !== propertyId &&
      lettingBlock(content, owned.property, today) !== 'rent.notLettable'
    ) {
      list.push({ kind: 'vacant', propertyId, deadlineDay: null });
    }
  }

  for (const loan of state.loans) {
    if (!loan.renegotiationSuggested || loan.renegotiationDeclinedPercent !== null) continue;
    const offer = worthyRefinance(content, state, loan);
    if (offer) {
      list.push({
        kind: 'renegotiation',
        loanId: loan.id,
        bankId: offer.bankId,
        ratePercent: offer.ratePercent,
        deadlineDay: null,
      });
    }
  }

  const forecast = cashForecast(content, state);
  if (forecast.lowest < 0 && forecast.lowestDay !== null) {
    list.push({ kind: 'cashAlert', lowest: forecast.lowest, deadlineDay: forecast.lowestDay });
  }

  for (const instance of state.catalog.pending) {
    list.push({
      kind: 'catalogEvent',
      instanceId: instance.id,
      eventId: instance.eventId,
      deadlineDay: instance.deadlineDay,
    });
  }
  const challenge = state.progress.challenge;
  if (challenge && !challenge.accepted) {
    list.push({
      kind: 'challengeOffer',
      challengeId: challenge.id,
      deadlineDay: challenge.deadlineDay,
    });
  }

  const autoPause = new Set<DecisionKind>(content.decisions.autoPause);
  const serious = new Set(content.decisions.seriousIncidents);
  const pauses = (decision: DecisionBody): boolean => {
    if (decision.kind === 'catalogEvent') {
      return content.events.find((event) => event.id === decision.eventId)?.pause ?? false;
    }
    if (decision.kind === 'incident' && serious.has(decision.kindId)) return true;
    return autoPause.has(decision.kind);
  };
  return list
    .map((decision) => ({ ...decision, autoPause: pauses(decision) }) as PendingDecision)
    .sort(
      (a, b) =>
        (a.deadlineDay ?? Number.POSITIVE_INFINITY) - (b.deadlineDay ?? Number.POSITIVE_INFINITY),
    );
}

/** Stable key of a decision, to tell new ones from those already seen (auto pause). */
export function decisionKey(decision: PendingDecision): string {
  switch (decision.kind) {
    case 'counterOffer':
      return `${decision.kind}:${decision.listingId}`;
    case 'loanNeeded':
    case 'deedFunds':
      return `${decision.kind}:${decision.purchaseId}`;
    case 'loanAnswer':
      return `${decision.kind}:${decision.purchaseId}:${decision.applicationIds.join(',')}`;
    case 'saleOffer':
      return `${decision.kind}:${decision.offerId}`;
    case 'worksHazard':
      return `${decision.kind}:${decision.propertyId}:${decision.hazardId}`;
    case 'quoteExpiring':
      return `${decision.kind}:${decision.quoteId}`;
    case 'renegotiation':
      return `${decision.kind}:${decision.loanId}`;
    case 'cashAlert':
      return decision.kind;
    case 'catalogEvent':
      return `${decision.kind}:${decision.instanceId}`;
    case 'challengeOffer':
      return `${decision.kind}:${decision.challengeId}`;
    case 'candidates':
    case 'coproVote':
    case 'incident':
    case 'dpeWarning':
    case 'vacant':
      return `${decision.kind}:${decision.propertyId}`;
  }
}

/** Monthly flows of one owned property, as they run today (before income tax). */
export interface PropertyCashFlow {
  /** Rent excluding charges (0 while vacant or unpaid and uninsured). */
  rent: Cents;
  recoverableCharges: Cents;
  charges: Cents;
  insurance: Cents;
  managementFees: Cents;
  coproCalls: Cents;
  /** Yearly property tax spread over the months. */
  propertyTax: Cents;
  loanPayment: Cents;
  /** Interest part of this month's payment. */
  loanInterest: Cents;
  net: Cents;
}

export function propertyCashFlow(
  content: GameContent,
  state: GameState,
  owned: OwnedProperty,
): PropertyCashFlow {
  const { property, lease } = owned;
  const isHome = state.player.homePropertyId === property.id;
  const recoverable = lease ? recoverableCharges(content, property) : 0;
  const rent = lease ? lease.monthlyRent : 0;
  const due = rent + recoverable;
  const agency = lease?.agencyId ? findAgency(content, lease.agencyId) : undefined;
  // Agency fees, or the fee for managing from afar a property of another city.
  const managementFees = agency
    ? Math.round(due * agency.feeShare)
    : isRemoteSelfManaged(state, owned)
      ? remoteManagementFee(content)
      : 0;
  const premium = lease?.insured
    ? Math.round(due * content.renting.unpaidRentInsurance.premiumShare)
    : 0;
  const insurance = (isHome ? 0 : ownerInsurance(content, property)) + premium;
  const coproCalls = owned.coproCalls.reduce((sum, call) => sum + call.monthly, 0);
  const propertyTax = Math.round(property.annualPropertyTax / MONTHS_PER_YEAR);
  const loans = state.loans.filter((loan) => loan.propertyId === property.id);
  const loanPayment = loans.reduce((sum, loan) => sum + loan.monthlyPayment, 0);
  const loanInterest = loans.reduce(
    (sum, loan) => sum + Math.round((loan.remaining * loan.ratePercent) / 100 / MONTHS_PER_YEAR),
    0,
  );
  const charges = property.monthlyCharges;
  return {
    rent,
    recoverableCharges: recoverable,
    charges,
    insurance,
    managementFees,
    coproCalls,
    propertyTax,
    loanPayment,
    loanInterest,
    net: due - charges - insurance - managementFees - coproCalls - propertyTax - loanPayment,
  };
}

export interface FinancingInput {
  bankId: string;
  durationYears: number;
  /** Price paid (asking price by default). */
  price?: Cents;
  /** Personal money put in; defaults to the fees (the minimum the banks ask). */
  contribution?: Cents;
  /** Works financed with the loan. */
  works?: Cents;
  /** Amount borrowed; when given, the contribution is what the loan leaves to pay. */
  amount?: Cents;
}

/** « Financement simulé » of a listing (docs/04, fiche annonce). */
export interface FinancingSimulation {
  price: Cents;
  notaryFees: Cents;
  bankFees: Cents;
  works: Cents;
  contribution: Cents;
  /** Minimum contribution the banks ask: the fees. */
  minContribution: Cents;
  loanAmount: Cents;
  durationYears: number;
  rate: RateQuote;
  monthlyPayment: Cents;
  /** Market rent, bare let, as the player knows the property. */
  rent: Cents;
  recoverableCharges: Cents;
  /** Charges left to the owner, property tax and insurance, per month. */
  ownerCosts: Cents;
  /** Rent and charges in, minus the owner's costs and the loan, per month (before tax). */
  netEffort: Cents;
  /** Cash left once the contribution is paid. */
  cashAfter: Cents;
  /** What the bank would answer today. */
  decision: LoanDecision;
}

export function simulateFinancing(
  content: GameContent,
  state: GameState,
  property: Property,
  askingPrice: Cents,
  input: FinancingInput,
  /** The listing or purchase financed, and its buyer (the SCI's bank counts its rent). */
  target: { id: string; holder: Holder } | null = null,
): FinancingSimulation | null {
  const bank = findBank(content, input.bankId);
  if (!bank) return null;
  const price = input.price ?? askingPrice;
  const works = Math.max(0, input.works ?? 0);
  const fees = purchaseFees({ content }, price, true);
  const sci = content.company.credit;
  const minContribution =
    target?.holder === 'company'
      ? Math.round(
          requiredContribution(content, price) * sci.feesContributionShare +
            price * sci.extraContributionShare,
        )
      : requiredContribution(content, price);
  const total = price + works + fees.notary + fees.bank;
  const contribution =
    input.amount !== undefined
      ? Math.max(0, total - input.amount)
      : Math.max(0, input.contribution ?? minContribution);
  const loanAmount = Math.max(0, total - contribution);
  const rate = quoteRate(content, state, bank, input.durationYears);
  const months = input.durationYears * MONTHS_PER_YEAR;
  const monthlyPayment = loanAmount > 0 ? annuityPayment(loanAmount, rate.ratePercent, months) : 0;
  const believed = believedView(content, property);
  const rent = rentRange(content, state, believed, 'bare').market;
  const recoverable = recoverableCharges(content, property);
  const ownerCosts =
    property.monthlyCharges +
    Math.round(property.annualPropertyTax / MONTHS_PER_YEAR) +
    ownerInsurance(content, property) +
    (property.cityId === state.player.baseCityId ? 0 : remoteManagementFee(content));
  const decision = evaluateLoan(content, state, {
    bankId: bank.id,
    amount: Math.max(1, loanAmount),
    durationYears: input.durationYears,
    price,
    works,
    contribution,
    ...(target ? { holder: target.holder, propertyId: target.id } : {}),
  });
  return {
    price,
    notaryFees: fees.notary,
    bankFees: fees.bank,
    works,
    contribution,
    minContribution,
    loanAmount,
    durationYears: input.durationYears,
    rate,
    monthlyPayment,
    rent,
    recoverableCharges: recoverable,
    ownerCosts,
    netEffort: rent + recoverable - ownerCosts - monthlyPayment,
    cashAfter: state.player.balance - contribution,
    decision,
  };
}

/** Rounding of the price at which a listing would pay for itself. */
const BREAK_EVEN_STEP = 1_000_00;

/**
 * « Cash-flow prévu » of a listing (progression, step 3): its financing with the account bank
 * over the usual length, the contribution at its minimum (the fees), let bare at the market
 * rent; and the highest price at which it would pay for itself.
 */
export interface CashFlowOutlook {
  /** Monthly flows of that financing, before income tax. */
  simulation: FinancingSimulation;
  /** Rent and charges in, minus the owner's costs and the loan, per month. */
  monthly: Cents;
  tone: 'positive' | 'balanced' | 'negative';
  /** Highest price (rounded down) at which the monthly cash flow is not negative; null: none. */
  breakEvenPrice: Cents | null;
}

export function cashFlowOutlook(
  content: GameContent,
  state: GameState,
  property: Property,
  askingPrice: Cents,
  price: Cents = askingPrice,
): CashFlowOutlook | null {
  const thresholds = content.yvon.thresholds;
  const simulation = simulateFinancing(content, state, property, askingPrice, {
    bankId: content.start.accountBankId,
    durationYears: thresholds.outlookYears,
    price,
  });
  if (!simulation || simulation.price <= 0) return null;
  const monthly = simulation.netEffort;
  const margin = toCents(thresholds.cashFlowEuros);
  const tone = monthly >= margin ? 'positive' : monthly <= -margin ? 'negative' : 'balanced';
  // The payment is proportional to the loan, and the loan almost to the price.
  const income = simulation.rent + simulation.recoverableCharges - simulation.ownerCosts;
  let breakEvenPrice: Cents | null = null;
  if (income > 0 && simulation.monthlyPayment > 0) {
    const affordableLoan = (simulation.loanAmount * income) / simulation.monthlyPayment;
    const exact = (affordableLoan * simulation.price) / simulation.loanAmount;
    breakEvenPrice = Math.floor(exact / BREAK_EVEN_STEP) * BREAK_EVEN_STEP;
  }
  return { simulation, monthly, tone, breakEvenPrice };
}

/** What the player can tell of a listing's price at a glance (game feel, lot 3). */
export type DealKind = 'bargain' | 'fair' | 'expensive';

export interface DealVerdict {
  kind: DealKind;
  /** Asking price against the player's own estimate (−0,12: 12 % under it). */
  priceGap: number;
}

/**
 * The asking price of a listing against the player's estimate (`estimateValue`:
 * what visits and diagnoses taught, hidden defects by their probability, so it
 * never gives a secret away). Thresholds in content/marche.json (`verdict`).
 */
export function dealVerdict(
  content: GameContent,
  state: GameState,
  listingId: string,
): DealVerdict | null {
  const listing = state.listings.find((candidate) => candidate.id === listingId);
  if (!listing) return null;
  const { estimate } = estimateValue(content, state, listing.property, listing.visited);
  if (estimate <= 0) return null;
  const priceGap = listing.askingPrice / estimate - 1;
  const { bargainShare, expensiveShare } = content.market.verdict;
  const kind: DealKind =
    priceGap <= -bargainShare ? 'bargain' : priceGap >= expensiveShare ? 'expensive' : 'fair';
  return { kind, priceGap };
}

/** Balance expected over the next days from the flows already known (docs/02, 2.6). */
export interface CashForecast {
  days: number;
  /** Lowest expected balance over the period. */
  lowest: Cents;
  /** Day number of that lowest balance; null when nothing changes. */
  lowestDay: number | null;
  endBalance: Cents;
}

/**
 * Known flows: the monthly statement (salary, home rent, living costs,
 * rents, charges, insurance, agency fees, calls for funds, loans, tax
 * instalments), the property tax, deeds and works bills falling due. Chance
 * (unpaid rents, incidents) is left out.
 */
export function cashForecast(
  content: GameContent,
  state: GameState,
  days = content.decisions.cashForecastDays,
): CashForecast {
  const today = toDayNumber(state.clock.date);
  const byDay = new Map<number, Cents>();
  const add = (day: number, amount: Cents) => byDay.set(day, (byDay.get(day) ?? 0) + amount);

  // Monthly statement.
  const monthly = monthlyStatementEstimate(content, state);
  for (let offset = 1; offset <= days; offset++) {
    if (fromDayNumber(today + offset).day === 1) add(today + offset, monthly);
  }
  // Property tax.
  const { month, day } = content.taxes.propertyTaxDate;
  const propertyTax = state.properties.reduce((sum, o) => sum + o.property.annualPropertyTax, 0);
  for (let offset = 1; offset <= days && propertyTax > 0; offset++) {
    const date = fromDayNumber(today + offset);
    if (date.month === month && date.day === day) add(today + offset, -propertyTax);
  }
  // Deeds whose financing is settled.
  for (const purchase of state.purchases) {
    if (!purchase.acceptedApplicationId && !purchase.cash) continue;
    if (purchase.deedDay > today + days) continue;
    add(Math.max(today, purchase.deedDay), -cashDueAtDeed({ content }, purchase));
  }
  // Works bills, at the planned end of each artisan's task, paid from the works fund first.
  for (const owned of state.properties) {
    let fund = owned.worksFund?.amount ?? 0;
    // A transformation is billed on its last day: the quote less what was paid (the deposit).
    const transformation = owned.works?.transformation;
    if (transformation && transformation.endDay <= today + days) {
      const bill = Math.max(0, transformation.total - (owned.works?.paid ?? 0));
      const fromFund = Math.min(fund, bill);
      fund -= fromFund;
      add(Math.max(today, transformation.endDay), -(bill - fromFund));
    }
    const tasks = (owned.works?.tasks ?? [])
      .filter((task) => task.status !== 'done' && task.artisanId !== null)
      .map((task) => ({
        day: Math.max(today, (task.startDay ?? task.availableDay) + task.days),
        bill: task.items.reduce((sum, item) => sum + item.price, 0) - task.deposit,
      }))
      .filter((task) => task.day <= today + days)
      .sort((a, b) => a.day - b.day);
    for (const task of tasks) {
      const fromFund = Math.min(fund, task.bill);
      fund -= fromFund;
      add(task.day, -(task.bill - fromFund));
    }
  }

  let balance = state.player.balance;
  let lowest = balance;
  let lowestDay: number | null = null;
  for (const dayNumber of [...byDay.keys()].sort((a, b) => a - b)) {
    balance += byDay.get(dayNumber) ?? 0;
    if (balance < lowest) {
      lowest = balance;
      lowestDay = dayNumber;
    }
  }
  return { days, lowest, lowestDay, endBalance: balance };
}

/** Point on the city map, in metres from its origin (x east, y north). */
export interface MapPoint {
  x: number;
  y: number;
}

const MAP_TRIES = 64;

function insidePolygon(point: MapPoint, polygon: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i] ?? [0, 0];
    const [xj, yj] = polygon[j] ?? [0, 0];
    if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Where a property's pin goes on the city map: a point inside its
 * neighbourhood, drawn from its id (stable, no draw from the game's random
 * generator). Real addresses may come later.
 */
export function mapPosition(content: GameContent, property: Property): MapPoint | null {
  const city = findCity(content, property.cityId);
  const neighbourhood = city.neighbourhoods.find((n) => n.id === property.neighbourhoodId);
  if (!neighbourhood) return null;
  const outlines = neighbourhood.outlines;
  const points = outlines.flat();
  if (points.length === 0) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const box = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
  for (let attempt = 0; attempt < MAP_TRIES; attempt++) {
    const point = {
      x: box.minX + hashFloat(0, `${property.id}#x${attempt}`) * (box.maxX - box.minX),
      y: box.minY + hashFloat(0, `${property.id}#y${attempt}`) * (box.maxY - box.minY),
    };
    if (outlines.some((outline) => insidePolygon(point, outline))) {
      return { x: Math.round(point.x), y: Math.round(point.y) };
    }
  }
  const first = outlines[0]?.[0];
  return first ? { x: first[0], y: first[1] } : null;
}

/** Game date of a day number, for the interface. */
export function dateOfDay(day: number): CalendarDate {
  return fromDayNumber(day);
}

/** What the listings screen and the listing sheet show of a listing. */
export interface ListingView {
  pricePerM2: Cents;
  /** Median price per m² of the neighbourhood for this kind of dwelling, today. */
  neighbourhoodPricePerM2: Cents;
  /** Asking price per m² against the neighbourhood (−0,05: 5 % below). */
  priceGap: number;
  condition: Condition;
  /** Market rent, bare let, as the player knows the property. */
  rent: Cents;
  /** Yearly rent over the asking price, in percent. */
  grossYieldPercent: number;
  knownItems: number;
  totalItems: number;
  estimate: Estimate;
  /** The player's estimate against the asking price (0,08: worth 8 % more than asked). */
  valueGap: number;
  /** Published today or yesterday. */
  isNew: boolean;
}

export function listingView(
  content: GameContent,
  state: GameState,
  listingId: string,
): ListingView | null {
  const listing = state.listings.find((candidate) => candidate.id === listingId);
  if (!listing) return null;
  const { property } = listing;
  const today = toDayNumber(state.clock.date);
  const neighbourhood = findNeighbourhood(content, property.cityId, property.neighbourhoodId);
  const priceIndex =
    state.market.cities[property.cityId]?.[property.neighbourhoodId]?.priceIndex ?? 1;
  const median = neighbourhood.sales[dwellingKindOf(property.kind)].pricePerM2.median;
  const neighbourhoodPricePerM2 = Math.round(median * priceIndex * 100);
  const pricePerM2 = Math.round(listing.askingPrice / Math.max(1, property.surface));
  const rent = rentRange(content, state, believedView(content, property), 'bare').market;
  const estimate = estimateValue(content, state, property, listing.visited);
  return {
    pricePerM2,
    neighbourhoodPricePerM2,
    priceGap: neighbourhoodPricePerM2 > 0 ? pricePerM2 / neighbourhoodPricePerM2 - 1 : 0,
    condition: conditionLabel(content, property),
    rent,
    grossYieldPercent: listing.askingPrice > 0 ? (rent * 12 * 100) / listing.askingPrice : 0,
    knownItems: property.items.filter((item) => item.known).length,
    totalItems: property.items.length,
    estimate,
    valueGap: listing.askingPrice > 0 ? estimate.estimate / listing.askingPrice - 1 : 0,
    isNew: today - listing.publishedDay <= 1,
  };
}

/** Prices and rents of a city's neighbourhoods today, for the map. */
export interface NeighbourhoodMarketView {
  neighbourhoodId: string;
  /** Median price per m² of an apartment. */
  pricePerM2: Cents;
  /** Rent per m² of a small apartment, charges included. */
  rentPerM2: Cents;
  trendPercent: number;
}

export function neighbourhoodMarkets(
  content: GameContent,
  state: GameState,
  cityId: string,
): NeighbourhoodMarketView[] {
  const city = findCity(content, cityId);
  return city.neighbourhoods.map((neighbourhood) => {
    const market = state.market.cities[cityId]?.[neighbourhood.id];
    const priceIndex = market?.priceIndex ?? 1;
    return {
      neighbourhoodId: neighbourhood.id,
      pricePerM2: Math.round(neighbourhood.sales.apartment.pricePerM2.median * priceIndex * 100),
      rentPerM2: Math.round(
        neighbourhood.rentPerM2.smallApartment *
          content.renting.marketRentFactor *
          priceIndex ** content.renting.priceIndexElasticity *
          100,
      ),
      trendPercent: market?.trendPercent ?? 0,
    };
  });
}

export type PropertyStatus =
  'home' | 'works' | 'sold' | 'forSale' | 'let' | 'listedForRent' | 'vacant';

/** Synthesis of the « Patrimoine » screen. */
export interface Portfolio {
  netWorth: Cents;
  balance: Cents;
  /** Owned properties at the player's estimate. */
  propertiesValue: Cents;
  debt: Cents;
  /** Net of next month's statement (salary, home, properties, loans, tax). */
  monthlyBudget: Cents;
  /** Sum of the properties' monthly cash flows (before income tax). */
  propertiesCashFlow: Cents;
  properties: {
    propertyId: string;
    value: Cents;
    cashFlow: PropertyCashFlow;
    status: PropertyStatus;
  }[];
}

export function propertyStatus(state: GameState, owned: OwnedProperty): PropertyStatus {
  if (state.player.homePropertyId === owned.property.id) return 'home';
  if (owned.works) return 'works';
  if (owned.sale?.agreement) return 'sold';
  if (owned.sale) return 'forSale';
  if (owned.lease) return 'let';
  if (owned.rental) return 'listedForRent';
  return 'vacant';
}

export function portfolio(content: GameContent, state: GameState): Portfolio {
  const properties = state.properties.map((owned) => ({
    propertyId: owned.property.id,
    value: estimateValue(content, state, owned.property, true).estimate,
    cashFlow: propertyCashFlow(content, state, owned),
    status: propertyStatus(state, owned),
  }));
  return {
    netWorth: netWorth(content, state),
    balance: state.player.balance,
    propertiesValue: properties.reduce((sum, p) => sum + p.value, 0),
    debt: state.loans.reduce((sum, loan) => sum + loan.remaining, 0),
    monthlyBudget: monthlyStatementEstimate(content, state),
    propertiesCashFlow: properties.reduce((sum, p) => sum + p.cashFlow.net, 0),
    properties,
  };
}
