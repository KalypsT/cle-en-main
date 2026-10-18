import {
  debtRatio,
  type Engine,
  type GameEvent,
  type GameState,
  monthlyLoanPayments,
  toDayNumber,
} from '@cle/engine';

const DAYS_PER_YEAR = 365;
const BAILLEUR_LET_PROPERTIES = 3;
const SEASONED_NET_WORTH = 250_000_00;

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
  /** First day with 3 let properties (stand-in for the Bailleur title). */
  bailleurDay: number | null;
  /** First month-start with a net worth of 250 k€ (Investisseur aguerri, one city). */
  seasonedDay: number | null;
  overdraftDays: number;
  minBalance: number;
}

const euros = (cents: number) => Math.round(cents / 100);

export class MetricsRecorder {
  private readonly startDay: number;
  private readonly visited = new Set<string>();
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
      overdraftDays: 0,
      minBalance: euros(state.player.balance),
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
          const let_ = state.properties.filter((owned) => owned.lease).length;
          if (m.bailleurDay === null && let_ >= BAILLEUR_LET_PROPERTIES) m.bailleurDay = day;
          if (day > 0 && day % DAYS_PER_YEAR === 0) {
            m.netWorthByYear.push(euros(this.engine.netWorth(state)));
          }
          break;
        }
        case 'monthStarted':
          if (m.seasonedDay === null && this.engine.netWorth(state) >= SEASONED_NET_WORTH) {
            m.seasonedDay = this.day(state);
          }
          break;
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
          break;
        case 'saleOfferReceived':
          if (event.buyerId) m.rivalOffers += 1;
          break;
        case 'forcedSale':
          m.forcedSales += 1;
          break;
        case 'bankrupt':
          m.bankruptDay = this.day(state);
          break;
        default:
          break;
      }
    }
  }

  finish(state: GameState): GameMetrics {
    const m = this.metrics;
    m.days = this.day(state);
    m.finalNetWorth = euros(this.engine.netWorth(state));
    m.finalBalance = euros(state.player.balance);
    m.finalDebt = euros(state.loans.reduce((sum, loan) => sum + loan.remaining, 0));
    m.finalProperties = state.properties.length;
    m.finalMonthlyRent = euros(
      state.properties.reduce((sum, owned) => sum + (owned.lease?.monthlyRent ?? 0), 0),
    );
    const ratio = debtRatio(this.engine.content, state);
    m.finalDebtRatio = monthlyLoanPayments(state) === 0 ? 0 : Number.isFinite(ratio) ? ratio : 9.99;
    return { ...m, rivalPurchases: { ...m.rivalPurchases } };
  }
}
