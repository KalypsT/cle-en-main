import { gameContent, timeSettings } from '@cle/content';
import {
  debtRatio,
  decisionKey,
  type DpeLabel,
  DPE_LABELS,
  type Engine,
  type GameEvent,
  type GameState,
  monthlyLoanPayments,
  toDayNumber,
} from '@cle/engine';

const DAYS_PER_YEAR = 365;
const HOURS_PER_DAY = 24;
const PASSOIRES: readonly DpeLabel[] = ['E', 'F', 'G'];
/** A new listing counts as a decision when it is this far under the estimate (docs/08, 8.1). */
const INTERESTING_DISCOUNT = 0.05;
/** …and the bot could pay the notary fees and a little more from its account. */
const INTERESTING_CASH_SHARE = 0.1;

/** What one game tells the balancing report. Amounts in euros, durations in days. */
export interface GameMetrics {
  botId: string;
  seed: number;
  jobId: string;
  days: number;
  /** Days from the start to the first deed. */
  firstPurchaseDay: number | null;
  bankruptDay: number | null;
  forcedSales: number;
  purchases: number;
  sales: number;
  visits: number;
  offers: number;
  /** Listings the bot had visited or made an offer on, bought by a named rival. */
  lostToRivals: number;
  /** Every listing bought by each rival during the game. */
  rivalPurchases: Record<string, number>;
  /** Rival offers received on the bot's properties for sale. */
  rivalOffers: number;
  /** Net worth at each anniversary (index 0 = after one year). */
  netWorthByYear: number[];
  finalNetWorth: number;
  finalBalance: number;
  finalDebt: number;
  finalProperties: number;
  /** Monthly rent paid by tenants at the end, before costs. */
  finalMonthlyRent: number;
  finalDebtRatio: number;
  /** Day the Bailleur title was earned (milestone 6: the real titles). */
  bailleurDay: number | null;
  /** Day the Investisseur aguerri title was earned (one city until milestone 7). */
  seasonedDay: number | null;
  /** Day each title was earned. */
  titleDays: Record<string, number>;
  achievements: number;
  finalReputation: number;
  /**
   * Density of decisions (docs/03-systemes/07): new entries of the decision
   * box, catalogue events with choices and interesting listings, over the
   * real time the game would take at ×1 with the automatic acceleration.
   */
  decisions: number;
  interestingListings: number;
  catalogEvents: number;
  catalogChoices: number;
  anecdotes: number;
  challengesOffered: number;
  challengesWon: number;
  realSeconds: number;
  /** Days the automatic acceleration would have run. */
  calmDays: number;
  overdraftDays: number;
  minBalance: number;
  /** Renting: property-months let, over property-months owned (main residence excluded). */
  letMonths: number;
  ownedMonths: number;
  rentMissed: number;
  evictions: number;
  incidents: number;
  tenantDepartures: number;
  /** Taxes (euros): tax on rents assessed, property tax, accountant, capital gains. */
  rentTax: number;
  propertyTax: number;
  accountantFees: number;
  capitalGainsTax: number;
  /** Property-years assessed, and those under a real regime. */
  assessedPropertyYears: number;
  realRegimeYears: number;
  furnishedYears: number;
  /** Works (milestone 3): projects completed, their cost (euros), hazards, DPE classes gained. */
  worksProjects: number;
  worksCost: number;
  hazards: number;
  dpeClassesGained: number;
  /** Properties classed E to G at the end. */
  finalPassoires: number;
}

const euros = (cents: number) => Math.round(cents / 100);

export class MetricsRecorder {
  private readonly startDay: number;
  private readonly visited = new Set<string>();
  /** Decisions already counted (their keys), as the interface tells new ones from old ones. */
  private seen = new Set<string>();
  private freshToday = 0;
  private readonly metrics: GameMetrics;
  private readonly engine: Engine;

  constructor(
    engine: Engine,
    state: GameState,
    botId: string,
    options: { seed: number; jobId: string },
  ) {
    this.engine = engine;
    this.startDay = toDayNumber(state.clock.date);
    this.metrics = {
      botId,
      seed: options.seed,
      jobId: options.jobId,
      days: 0,
      firstPurchaseDay: null,
      bankruptDay: null,
      forcedSales: 0,
      purchases: 0,
      sales: 0,
      visits: 0,
      offers: 0,
      lostToRivals: 0,
      rivalPurchases: {},
      rivalOffers: 0,
      netWorthByYear: [],
      finalNetWorth: 0,
      finalBalance: 0,
      finalDebt: 0,
      finalProperties: 0,
      finalMonthlyRent: 0,
      finalDebtRatio: 0,
      bailleurDay: null,
      seasonedDay: null,
      titleDays: {},
      achievements: 0,
      finalReputation: 0,
      decisions: 0,
      interestingListings: 0,
      catalogEvents: 0,
      catalogChoices: 0,
      anecdotes: 0,
      challengesOffered: 0,
      challengesWon: 0,
      realSeconds: 0,
      calmDays: 0,
      overdraftDays: 0,
      minBalance: euros(state.player.balance),
      letMonths: 0,
      ownedMonths: 0,
      rentMissed: 0,
      evictions: 0,
      incidents: 0,
      tenantDepartures: 0,
      rentTax: 0,
      propertyTax: 0,
      accountantFees: 0,
      capitalGainsTax: 0,
      assessedPropertyYears: 0,
      realRegimeYears: 0,
      furnishedYears: 0,
      worksProjects: 0,
      worksCost: 0,
      hazards: 0,
      dpeClassesGained: 0,
      finalPassoires: 0,
    };
  }

  private day(state: GameState): number {
    return toDayNumber(state.clock.date) - this.startDay;
  }

  record(events: GameEvent[], state: GameState): void {
    const m = this.metrics;
    for (const event of events) {
      switch (event.type) {
        case 'dayStarted': {
          const day = this.day(state);
          if (state.player.balance < 0) m.overdraftDays += 1;
          m.minBalance = Math.min(m.minBalance, euros(state.player.balance));
          if (day > 0 && day % DAYS_PER_YEAR === 0) {
            m.netWorthByYear.push(euros(this.engine.netWorth(state)));
          }
          break;
        }
        case 'titleEarned':
          m.titleDays[event.titleId] ??= this.day(state);
          if (event.titleId === 'landlord') m.bailleurDay ??= this.day(state);
          if (event.titleId === 'seasonedInvestor') m.seasonedDay ??= this.day(state);
          break;
        case 'achievementEarned':
          m.achievements += 1;
          break;
        case 'catalogEventStarted':
          m.catalogEvents += 1;
          break;
        case 'catalogEventHappened':
          m.catalogEvents += 1;
          break;
        case 'catalogEventResolved':
          if (!event.auto) m.catalogChoices += 1;
          break;
        case 'anecdote':
          m.anecdotes += 1;
          break;
        case 'challengeOffered':
          m.challengesOffered += 1;
          break;
        case 'challengeWon':
          m.challengesWon += 1;
          break;
        case 'listingPublished':
        case 'offMarketOffered':
          if (this.interesting(state, event.listingId)) {
            m.interestingListings += 1;
            m.decisions += 1;
            this.freshToday += 1;
          }
          break;
        case 'monthStarted': {
          const rented = state.properties.filter(
            (owned) => owned.property.id !== state.player.homePropertyId,
          );
          m.ownedMonths += rented.length;
          m.letMonths += rented.filter((owned) => owned.lease).length;
          break;
        }
        case 'rentMissed':
          m.rentMissed += 1;
          break;
        case 'incidentReported':
          m.incidents += 1;
          break;
        case 'tenantLeft':
          if (event.reason === 'evicted') m.evictions += 1;
          else m.tenantDepartures += 1;
          break;
        case 'propertyTaxCharged':
          m.propertyTax += euros(event.amount);
          break;
        case 'taxAssessed': {
          m.rentTax += euros(event.total);
          m.accountantFees += euros(event.accountantFees);
          const properties = state.tax.lastAssessment?.properties ?? [];
          m.assessedPropertyYears += properties.length;
          m.realRegimeYears += properties.filter((p) => p.regime === 'real').length;
          m.furnishedYears += properties.filter((p) => p.category === 'furnished').length;
          break;
        }
        case 'visitDone':
          m.visits += 1;
          this.visited.add(event.listingId);
          break;
        case 'offerMade':
          m.offers += 1;
          this.visited.add(event.listingId);
          break;
        case 'listingSold':
          if (event.buyer === 'rival') {
            m.rivalPurchases[event.rivalId] = (m.rivalPurchases[event.rivalId] ?? 0) + 1;
            if (this.visited.has(event.listingId)) m.lostToRivals += 1;
          }
          break;
        case 'deedSigned':
          m.purchases += 1;
          m.firstPurchaseDay ??= this.day(state);
          break;
        case 'propertySold':
          m.sales += 1;
          m.capitalGainsTax += euros(event.capitalGainsTax);
          break;
        case 'saleOfferReceived':
          if (event.buyerId) m.rivalOffers += 1;
          break;
        case 'forcedSale':
          m.forcedSales += 1;
          m.capitalGainsTax += euros(event.capitalGainsTax);
          break;
        case 'bankrupt':
          m.bankruptDay ??= this.day(state);
          break;
        case 'worksCompleted':
          m.worksProjects += 1;
          m.worksCost += euros(event.cost);
          m.dpeClassesGained += Math.max(
            0,
            DPE_LABELS.indexOf(event.dpeBefore) - DPE_LABELS.indexOf(event.dpeAfter),
          );
          break;
        case 'worksHazard':
          m.hazards += 1;
          break;
        default:
          break;
      }
    }
  }

  get bankrupt(): boolean {
    return this.metrics.bankruptDay !== null;
  }

  /** A new listing worth a look: well under the estimate, and affordable. */
  private interesting(state: GameState, listingId: string): boolean {
    const listing = state.listings.find((candidate) => candidate.id === listingId);
    const estimate = this.engine.estimate(state, listingId);
    if (!listing || !estimate) return false;
    return (
      listing.askingPrice <= estimate.estimate * (1 - INTERESTING_DISCOUNT) &&
      state.player.balance >= listing.askingPrice * INTERESTING_CASH_SHARE
    );
  }

  /** Counts the decisions that appeared since the last look (the decision box). */
  observeDecisions(state: GameState): void {
    const keys = this.engine.pendingDecisions(state).map(decisionKey);
    for (const key of keys) {
      if (this.seen.has(key)) continue;
      this.metrics.decisions += 1;
      this.freshToday += 1;
    }
    this.seen = new Set(keys);
  }

  /**
   * Real time of a part of the day at ×1 with the automatic acceleration:
   * every hour at ×1 while something waits for the player, otherwise a few
   * quiet hours after any new decision, then the accelerated speed.
   */
  addTime(hours: number, calm: boolean): void {
    const rules = gameContent.rhythm.autoSpeed;
    const perHour = timeSettings.realSecondsPerGameDay / HOURS_PER_DAY;
    const quiet = this.freshToday > 0 ? Math.min(hours, rules.quietHours) : 0;
    const seconds = calm
      ? quiet * perHour + ((hours - quiet) * perHour) / rules.speed
      : hours * perHour;
    if (calm) this.metrics.calmDays += hours / HOURS_PER_DAY;
    this.metrics.realSeconds += seconds;
    this.freshToday = 0;
  }

  finish(state: GameState): GameMetrics {
    const m = this.metrics;
    m.days = this.day(state);
    m.finalNetWorth = euros(this.engine.netWorth(state));
    m.finalBalance = euros(state.player.balance);
    m.finalDebt = euros(state.loans.reduce((sum, loan) => sum + loan.remaining, 0));
    m.finalProperties = state.properties.length;
    m.finalPassoires = state.properties.filter((owned) =>
      PASSOIRES.includes(owned.property.dpe),
    ).length;
    m.finalReputation = state.player.reputation;
    m.finalMonthlyRent = euros(
      state.properties.reduce((sum, owned) => sum + (owned.lease?.monthlyRent ?? 0), 0),
    );
    const ratio = debtRatio(this.engine.content, state);
    m.finalDebtRatio = monthlyLoanPayments(state) === 0 ? 0 : Number.isFinite(ratio) ? ratio : 9.99;
    return { ...m, rivalPurchases: { ...m.rivalPurchases }, titleDays: { ...m.titleDays } };
  }
}
