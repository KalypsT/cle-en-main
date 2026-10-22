import type { DispatchResult, GameAction, RefusalCode } from './actions.ts';
import { type CalendarDate, isValidDate, toDayNumber, toIsoDate } from './calendar.ts';
import { advanceClock, createClock, HOURS_PER_DAY } from './clock.ts';
import { deepClone } from './clone.ts';
import { findJob, type GameContent, type LeaseType } from './content.ts';
import type { GameEvent, StatementLine } from './events.ts';
import { type Cents, toCents } from './money.ts';
import { nextFloat, seedRng } from './random.ts';
import { deserializeGame, type MigrationRegistry, MIGRATIONS } from './serialization.ts';
import {
  type Avatar,
  FORMAT_VERSION,
  type GameState,
  type SaleMode,
  type TransformationKind,
} from './state.ts';
import { monthlyPoint, recordPropertyValues, statementNet } from './systems/history.ts';
import {
  keepStatement,
  keepYearReview,
  priceChange,
  recordBankHistory,
  recordBankTrust,
  recordMarketPoint,
  recordPropertyLog,
} from './systems/archives.ts';
import {
  dismissMail,
  emptyInbox,
  freezeInbox,
  markNewsSeen,
  recordInbox,
} from './systems/inbox.ts';
import { buyoutRetryDay, occupiedDiscount, offerBuyout } from './systems/buyout.ts';
import {
  evaluateLoan,
  initialBankRelations,
  type LoanDecision,
  loanSheets,
  type LoanRequest,
  quoteRate,
  type RateQuote,
  refinanceLoan,
  runDailyOverdraft,
  runMonthlyLoanPayments,
  runMonthlyTrust,
  runRenegotiationCheck,
} from './systems/banking.ts';
import {
  cancelAgendaItem,
  moveAgendaItem,
  requestMeeting,
  requestSelfRepair,
  requestVisit,
  runDailyAgenda,
} from './systems/agenda.ts';
import { chooseEvent, runDailyCatalog } from './systems/catalog.ts';
import { answerChallenge, runDailyChallenges } from './systems/challenges.ts';
import { modeOf, rewindsLeft } from './systems/modes.ts';
import {
  addChronicle,
  checkMilestones,
  initialProgress,
  recordProgress,
  runYearlyProgress,
} from './systems/progress.ts';
import {
  agendaWeek,
  buildYearReview,
  monthlyReview,
  pace,
  progressionView,
  regimeAdvice,
} from './systems/reviews.ts';
import { runDailyDistress } from './systems/distress.ts';
import type { SystemContext } from './systems/context.ts';
import { citySheet, citySheets, visitQuote } from './systems/city-views.ts';
import { remoteManagementFee } from './systems/cities.ts';
import { moveHome } from './systems/cities.ts';
import { dailyFreeTime, runMonthlyHousehold, startFreeDay } from './systems/household.ts';
import { freezeListings, runDailyListings, seedListings } from './systems/listings.ts';
import { companySheet, createCompany, setPurchaseHolder } from './systems/company.ts';
import { expireCrises } from './systems/crises.ts';
import {
  runDailyTransformations,
  startTransformation,
  transformationEstimate,
  transformationQuote,
} from './systems/transformations.ts';
import { roundRate, runMonthlyMarketRate } from './systems/market-rate.ts';
import { netWorth } from './systems/net-worth.ts';
import { answerCounter, makeOffer } from './systems/offers.ts';
import { initialCityMarkets, runMonthlyPrices } from './systems/prices.ts';
import {
  acceptLoan,
  cashDueAtDeed,
  requestLoan,
  runDailyPurchases,
  signCompromis,
  waiveLoanCondition,
  withdrawPurchase,
} from './systems/purchases.ts';
import {
  repairIncident,
  runDailyLeases,
  runMonthlyLeases,
  runYearlyDpeWarnings,
} from './systems/leases.ts';
import {
  acceptApplication,
  changeManagement,
  furnitureCost,
  letBanDay,
  leaseOptions,
  lettingBlock,
  listForRent,
  moveIntoHome,
  moveOutOfHome,
  ownerInsurance,
  recoverableCharges,
  rejectApplication,
  rentRange,
  runDailyRentalListings,
  withdrawRental,
} from './systems/renting.ts';
import {
  capitalGainsTax,
  closeTaxYear,
  companyAccountantFees,
  estimateRegimes,
  initialTaxState,
  recordStatement,
  runDailyPropertyTax,
  runMonthlyTaxInstalment,
  setTaxRegime,
} from './systems/taxes.ts';
import { initialRivals, runDailyRivals, runMonthlyRivals } from './systems/rivals.ts';
import { runDailyCopro, runMonthlyCopro, voteResolution } from './systems/copro.ts';
import { ambience, findBuilding, section, streets } from './systems/world.ts';
import {
  answerHazard,
  delegateWorks,
  artisanDiscount,
  diagnose,
  type ItemChoice,
  knownArtisans,
  requestQuote,
  runDailyWorks,
  runYearlyWear,
  startWorks,
} from './systems/works.ts';
import { worksCatalog, worksEstimate, worksPlan } from './systems/works-view.ts';
import { believedView } from './systems/dwelling.ts';
import {
  cashForecast,
  type FinancingInput,
  listingView,
  mapPosition,
  neighbourhoodMarkets,
  portfolio,
  pendingDecisions,
  propertyCashFlow,
  simulateFinancing,
  cashFlowOutlook,
} from './systems/ui-queries.ts';
import {
  answerSaleOffer,
  listForSale,
  runDailyResale,
  saleProceeds,
  updateSale,
} from './systems/resale.ts';
import {
  type Estimate,
  estimateValue,
  realValue,
  type ValueBreakdown,
} from './systems/valuation.ts';

export interface CreateGameOptions {
  /** uint32 seed of the random generator. */
  seed: number;
  /** First day of the game, supplied by the caller (the engine never reads the system clock). */
  startDate: CalendarDate;
  /** Hour of day the game starts at, 0 … 23. */
  startHour: number;
  /** Defaults to the content's default job. */
  jobId?: string;
  /** Defaults to the content's default name; trimmed and cut to the maximum length. */
  name?: string;
  avatar?: Avatar;
  /** Gérard's tutorial; on by default. */
  tutorial?: boolean;
  /** Game mode (content/modes.json); the default one when absent. */
  modeId?: string;
}

export type RewindResult =
  { ok: true; state: GameState } | { ok: false; reason: 'rewind.invalidPoint' | 'rewind.noneLeft' };

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

/** Starting game state, from the content's starting conditions. */
export function createInitialState(content: GameContent, options: CreateGameOptions): GameState {
  const { seed, startDate, startHour } = options;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError(`Seed must be a uint32, got ${seed}`);
  }
  if (!isValidDate(startDate)) {
    throw new RangeError(`Invalid start date ${JSON.stringify(startDate)}`);
  }
  if (!Number.isInteger(startHour) || startHour < 0 || startHour >= HOURS_PER_DAY) {
    throw new RangeError(`Invalid start hour ${startHour}`);
  }
  const job = findJob(content, options.jobId ?? content.start.defaultJobId);
  const modeId = options.modeId ?? content.modes.defaultModeId;
  if (!content.modes.modes.some((mode) => mode.id === modeId)) {
    throw new RangeError(`Unknown game mode ${modeId}`);
  }
  const rng = seedRng(seed);
  const startRate = roundRate(content.marketRate.startPercent);
  const state: GameState = {
    formatVersion: FORMAT_VERSION,
    seed,
    rng,
    startDate: { ...startDate },
    clock: createClock(startDate, startHour),
    nextId: 1,
    company: null,
    player: {
      name: playerName(content, options.name),
      avatar: { ...(options.avatar ?? { face: 0, hair: 0, skin: 0, outfit: 0 }) },
      jobId: job.id,
      employed: true,
      balance: toCents(content.start.savings),
      overdraftDays: 0,
      overdraftInterestThisMonth: 0,
      monthlyRent: toCents(content.start.monthlyRent),
      freeTimeMinutes: 0,
      reputation: content.start.reputation,
      rentalHistoryMonths: 0,
      bankruptDay: null,
      homePropertyId: null,
      baseCityId: content.start.cityId,
      tripsToday: [],
      lastMoveDay: null,
      renown: {},
    },
    banks: initialBankRelations(content, job.bankTrust),
    market: {
      ratePercent: startRate,
      cyclePhase: nextFloat(rng),
      laggedRatePercent: startRate,
      cities: initialCityMarkets(content, startDate),
      crises: [],
    },
    loans: [],
    listings: [],
    purchases: [],
    properties: [],
    agenda: [],
    rivals: initialRivals(content),
    tax: initialTaxState(startDate.year),
    artisans: {},
    worksDone: {},
    favorites: [],
    inbox: emptyInbox(),
    soldProperties: [],
    closedLoans: [],
    marketHistory: [],
    tutorial: { enabled: options.tutorial ?? true, step: 0 },
    history: [],
    lastStatement: null,
    modeId,
    rewinds: 0,
    gameOver: null,
    progress: initialProgress(content),
    chronicle: [{ day: toDayNumber(startDate), kind: 'start', ref: null, amount: null }],
    catalog: { pending: [], lastDay: {}, anecdotes: [] },
    lastYearReview: null,
    reviews: { statements: [], years: [] },
  };
  if (!isValidAvatar(state.player.avatar)) {
    throw new RangeError(`Invalid avatar ${JSON.stringify(options.avatar)}`);
  }
  // The market already has listings on the first day.
  for (const cityId of Object.keys(content.cities))
    seedListings(context(content, state, []), cityId);
  state.history.push(monthlyPoint(content, state, 0));
  recordMarketPoint(state);
  // Free time left on the first day, prorated to the hours remaining.
  const fullDay = dailyFreeTime(content, state, startDate);
  state.player.freeTimeMinutes = Math.floor(
    (fullDay * (HOURS_PER_DAY - startHour)) / HOURS_PER_DAY,
  );
  return state;
}

function context(content: GameContent, state: GameState, events: GameEvent[]): SystemContext {
  return { content, state, events, today: toDayNumber(state.clock.date) };
}

/** Systems run in this fixed order at the start of each game day. */
function runNewDay(ctx: SystemContext, monthStarted: boolean, yearStarted: boolean): void {
  let regime: ReturnType<typeof regimeAdvice> = [];
  if (yearStarted) {
    // Yearly review: last year's tax, before this year's first flows.
    regime = regimeAdvice(ctx);
    closeTaxYear(ctx);
    runYearlyDpeWarnings(ctx);
    runYearlyWear(ctx);
    runYearlyProgress(ctx);
  }
  if (monthStarted) {
    runMonthlyMarketRate(ctx);
    runMonthlyPrices(ctx);
    expireCrises(ctx);
    const lines: StatementLine[] = [];
    runMonthlyRivals(ctx);
    runMonthlyHousehold(ctx, lines);
    runMonthlyLeases(ctx, lines);
    runMonthlyCopro(ctx, lines);
    const paidBankIds = new Set(ctx.state.loans.map((loan) => loan.bankId));
    const loanProperty = new Map(ctx.state.loans.map((loan) => [loan.id, loan.propertyId]));
    runMonthlyLoanPayments(ctx, lines);
    recordStatement(ctx, lines, loanProperty);
    runMonthlyTaxInstalment(ctx, lines);
    runMonthlyTrust(ctx, paidBankIds);
    runRenegotiationCheck(ctx);
    const { player } = ctx.state;
    if (player.overdraftInterestThisMonth > 0) {
      lines.push({ kind: 'overdraftInterest', amount: player.overdraftInterestThisMonth });
      player.overdraftInterestThisMonth = 0;
    }
    ctx.events.push({ type: 'monthlyStatement', lines, balance: player.balance });
    ctx.state.lastStatement = { date: { ...ctx.state.clock.date }, lines, balance: player.balance };
    keepStatement(ctx);
  }
  startFreeDay(ctx, ctx.state.clock.date);
  runDailyAgenda(ctx);
  runDailyWorks(ctx);
  runDailyTransformations(ctx);
  runDailyCopro(ctx);
  runDailyPurchases(ctx);
  runDailyRivals(ctx);
  runDailyListings(ctx, (listing, price) => signCompromis(ctx, listing, price));
  runDailyLeases(ctx);
  runDailyRentalListings(ctx);
  runDailyPropertyTax(ctx);
  runDailyResale(ctx);
  runDailyCatalog(ctx);
  runDailyChallenges(ctx);
  runDailyOverdraft(ctx);
  runDailyDistress(ctx);
  recordProgress(ctx, ctx.events.slice());
  checkMilestones(ctx);
  if (monthStarted) {
    // The wealth curve, once the first day of the month has run.
    const net = statementNet(ctx.state.lastStatement?.lines ?? []);
    ctx.state.history.push(monthlyPoint(ctx.content, ctx.state, net));
    recordPropertyValues(ctx.content, ctx.state);
    recordBankTrust(ctx.state);
    recordMarketPoint(ctx.state);
  }
  if (yearStarted) {
    ctx.state.lastYearReview = buildYearReview(ctx, regime);
    keepYearReview(ctx.state);
  }
}

function playerName(content: GameContent, name: string | undefined): string {
  const trimmed = (name ?? '').trim().slice(0, content.start.maxPlayerNameLength);
  return trimmed === '' ? content.start.defaultPlayerName : trimmed;
}

function isValidAvatar(avatar: Avatar): boolean {
  return Object.values(avatar).every((part) => Number.isInteger(part) && part >= 0);
}

/** The engine bound to its content. Every function is pure: inputs are never mutated. */
export function createEngine(content: GameContent) {
  function tick(state: GameState): TickResult {
    // The game is over (Exigeant mode): time stands still.
    if (state.gameOver) return { state, events: [] };
    const { clock, events } = advanceClock(state.clock);
    if (events.length === 0) return { state: { ...state, clock }, events };
    const draft = deepClone({ ...state, clock });
    const ctx = context(content, draft, events);
    runNewDay(
      ctx,
      events.some((event) => event.type === 'monthStarted'),
      events.some((event) => event.type === 'yearStarted'),
    );
    recordInbox(content, draft, state, events, ctx.today);
    recordBankHistory(draft, state, events, ctx.today);
    recordPropertyLog(draft, events, ctx.today);
    freezeListings(draft);
    freezeInbox(draft);
    return { state: draft, events };
  }

  function advanceHours(state: GameState, hours: number): TickResult {
    let current = state;
    const events: GameEvent[] = [];
    for (let i = 0; i < hours; i++) {
      const result = tick(current);
      current = result.state;
      for (const event of result.events) events.push(event);
    }
    return { state: current, events };
  }

  function dispatch(state: GameState, action: GameAction): DispatchResult {
    if (state.gameOver) return { ok: false, state, reason: { code: 'game.over' } };
    const draft = deepClone(state);
    const events: GameEvent[] = [];
    const ctx = context(content, draft, events);
    let refusal: RefusalCode | null;
    switch (action.type) {
      case 'bank/meet':
        refusal = requestMeeting(ctx, action.bankId);
        break;
      case 'bank/refinance':
        refusal = refinanceLoan(ctx, action.loanId, action.bankId);
        break;
      case 'market/visit':
        refusal = requestVisit(ctx, action.listingId);
        break;
      case 'market/offer':
        refusal = makeOffer(ctx, action.listingId, action.amount);
        break;
      case 'market/answerCounter':
        refusal = answerCounter(ctx, action.listingId, action.accept);
        break;
      case 'purchase/requestLoan':
        refusal = requestLoan(
          ctx,
          action.purchaseId,
          action.bankId,
          action.amount,
          action.durationYears,
          action.works ?? 0,
        );
        break;
      case 'purchase/acceptLoan':
        refusal = acceptLoan(ctx, action.purchaseId, action.applicationId);
        break;
      case 'purchase/payCash':
        refusal = waiveLoanCondition(ctx, action.purchaseId);
        break;
      case 'purchase/withdraw':
        refusal = withdrawPurchase(ctx, action.purchaseId);
        break;
      case 'sale/list':
        refusal = listForSale(ctx, action.propertyId, action.askingPrice, action.mode);
        break;
      case 'sale/update':
        refusal = updateSale(ctx, action.propertyId, action.askingPrice);
        break;
      case 'sale/withdraw':
        refusal = updateSale(ctx, action.propertyId, null);
        break;
      case 'sale/acceptOffer':
        refusal = answerSaleOffer(ctx, action.propertyId, action.offerId, { type: 'accept' });
        break;
      case 'sale/rejectOffer':
        refusal = answerSaleOffer(ctx, action.propertyId, action.offerId, { type: 'reject' });
        break;
      case 'sale/counterOffer':
        refusal = answerSaleOffer(ctx, action.propertyId, action.offerId, {
          type: 'counter',
          amount: action.amount,
        });
        break;
      case 'rent/list':
        refusal = listForRent(ctx, action.propertyId, {
          leaseType: action.leaseType,
          monthlyRent: action.monthlyRent,
          agencyId: action.agencyId,
          insured: action.insured,
        });
        break;
      case 'rent/withdraw':
        refusal = withdrawRental(ctx, action.propertyId);
        break;
      case 'rent/accept':
        refusal = acceptApplication(ctx, action.propertyId, action.applicationId);
        break;
      case 'rent/reject':
        refusal = rejectApplication(ctx, action.propertyId, action.applicationId);
        break;
      case 'rent/manage':
        refusal = changeManagement(ctx, action.propertyId, action.agencyId);
        break;
      case 'rent/buyout':
        refusal = offerBuyout(ctx, action.propertyId, action.amount);
        break;
      case 'rent/repair':
        refusal =
          action.method === 'self'
            ? requestSelfRepair(ctx, action.propertyId)
            : repairIncident(ctx, action.propertyId, action.method);
        break;
      case 'agenda/cancel':
        refusal = cancelAgendaItem(ctx, action.itemId);
        break;
      case 'agenda/move':
        refusal = moveAgendaItem(ctx, action.itemId, action.day);
        break;
      case 'event/choose':
        refusal = chooseEvent(ctx, action.eventId, action.choiceId);
        break;
      case 'challenge/answer':
        refusal = answerChallenge(ctx, action.accept);
        break;
      case 'home/moveIn':
        refusal = moveIntoHome(ctx, action.propertyId);
        break;
      case 'home/moveOut':
        refusal = moveOutOfHome(ctx);
        break;
      case 'city/move':
        refusal = moveHome(ctx, action.cityId);
        break;
      case 'tax/setRegime':
        refusal = setTaxRegime(ctx, action.propertyId, action.regime);
        break;
      case 'market/diagnose':
        refusal = diagnose(ctx, action.listingId, action.trade);
        break;
      case 'works/quote':
        refusal = requestQuote(ctx, action.propertyId, action.artisanId, action.items);
        break;
      case 'works/start':
        refusal = startWorks(ctx, action.propertyId, action.quoteIds, action.diy);
        break;
      case 'works/hazard':
        refusal = answerHazard(ctx, action.propertyId, action.choice);
        break;
      case 'works/delegate':
        refusal = delegateWorks(ctx, action.propertyId, action.items);
        break;
      case 'works/transform':
        refusal = startTransformation(ctx, action.propertyId, action.kind);
        break;
      case 'copro/vote':
        refusal = voteResolution(ctx, action.propertyId, action.resolutionId, action.vote);
        break;
      case 'market/favorite':
        refusal = setFavorite(draft, action.listingId, action.favorite);
        break;
      case 'inbox/dismissMail':
        refusal = dismissMail(draft, action.mailId);
        break;
      case 'inbox/seeNews':
        refusal = markNewsSeen(draft);
        break;
      case 'tutorial/set':
        refusal = null;
        if (action.enabled !== undefined) draft.tutorial.enabled = action.enabled;
        if (action.step !== undefined) {
          if (!Number.isInteger(action.step) || action.step < 0) refusal = 'tutorial.invalidStep';
          else draft.tutorial.step = action.step;
        }
        break;
      case 'company/create':
        refusal = createCompany(ctx);
        break;
      case 'purchase/setHolder':
        refusal = setPurchaseHolder(ctx, action.purchaseId, action.holder);
        break;
      case 'job/resign':
        if (!draft.player.employed) {
          refusal = 'job.alreadyResigned';
        } else {
          refusal = null;
          draft.player.employed = false;
          events.push({ type: 'resigned' });
        }
        break;
    }
    if (refusal) return { ok: false, state, reason: { code: refusal } };
    recordProgress(ctx, events.slice());
    checkMilestones(ctx);
    recordInbox(content, draft, state, events, ctx.today);
    recordBankHistory(draft, state, events, ctx.today);
    recordPropertyLog(draft, events, ctx.today);
    freezeListings(draft);
    freezeInbox(draft);
    return { ok: true, state: draft, events };
  }

  /**
   * Goes back to a monthly rewind point (docs/02, section 2.7). The count of
   * rewinds is the current game's, so going back never gives them back.
   */
  function rewind(current: GameState, checkpoint: GameState): RewindResult {
    if (
      checkpoint.seed !== current.seed ||
      checkpoint.clock.elapsedHours >= current.clock.elapsedHours
    ) {
      return { ok: false, reason: 'rewind.invalidPoint' };
    }
    if (rewindsLeft(content, current) === 0) return { ok: false, reason: 'rewind.noneLeft' };
    const state = deepClone(checkpoint);
    state.rewinds = current.rewinds + 1;
    state.modeId = current.modeId;
    const events: GameEvent[] = [];
    addChronicle(context(content, state, events), 'rewind', toIsoDate(current.clock.date));
    return { ok: true, state };
  }

  return {
    content,
    createGame: (options: CreateGameOptions) => createInitialState(content, options),
    tick,
    advanceHours,
    dispatch,
    rewind,
    /** Rewinds left in this game; null: unlimited. */
    rewindsLeft: (state: GameState) => rewindsLeft(content, state),
    /** The game mode and its coefficients. */
    mode: (state: GameState) => modeOf(content, state),
    /** Nothing waits for the player: the automatic acceleration may run. */
    pace: (state: GameState) => pace(content, state),
    /** The short monthly review, from the last statement (null before the first one). */
    monthlyReview: (state: GameState, date?: CalendarDate) => monthlyReview(content, state, date),
    /** How a neighbourhood's prices moved over the last months (docs/04, « Fiche annonce »). */
    priceChange: (state: GameState, cityId: string, neighbourhoodId: string, months: number) =>
      priceChange(state, cityId, neighbourhoodId, months),
    /** Titles, achievements, reputation, challenge, records (« Progression »). */
    progression: (state: GameState) => progressionView(content, state),
    /** The coming days of the agenda. */
    agendaWeek: (state: GameState, days?: number) => agendaWeek(content, state, days),
    /** Loads a save, migrating it to the current format. Throws SaveFormatError. */
    loadGame: (json: string, registry: MigrationRegistry = MIGRATIONS) =>
      deserializeGame(json, { content }, registry),
    /** Rate a bank would offer today, with its breakdown. */
    quoteRate: (state: GameState, bankId: string, durationYears: number): RateQuote | null => {
      const bank = content.banks.find((candidate) => candidate.id === bankId);
      return bank ? quoteRate(content, state, bank, durationYears) : null;
    },
    /** What a bank would answer to a loan request today. */
    evaluateLoan: (state: GameState, request: LoanRequest): LoanDecision =>
      evaluateLoan(content, state, request),
    /**
     * What the player can tell of a listing's or an owned property's value:
     * hidden defects count by their probability, with a range.
     */
    estimate: (state: GameState, id: string): Estimate | null => {
      const listing = state.listings.find((candidate) => candidate.id === id);
      if (listing) return estimateValue(content, state, listing.property, listing.visited);
      const owned = state.properties.find((candidate) => candidate.property.id === id);
      return owned ? estimateValue(content, state, owned.property, true) : null;
    },
    /**
     * Real value, hidden defects included. Never shown to the player: for
     * tests and balancing reports only.
     */
    realValue: (state: GameState, id: string): ValueBreakdown | null => {
      const property =
        state.listings.find((candidate) => candidate.id === id)?.property ??
        state.purchases.find((candidate) => candidate.id === id)?.property ??
        state.properties.find((candidate) => candidate.property.id === id)?.property;
      return property ? realValue(content, state, property) : null;
    },
    /** Cash the player needs on the deed day of a purchase under compromis. */
    cashDueAtDeed: (state: GameState, purchaseId: string): Cents | null => {
      const purchase = state.purchases.find((candidate) => candidate.id === purchaseId);
      return purchase ? cashDueAtDeed({ content }, purchase) : null;
    },
    /** Net proceeds if an owned property sold today at `price` (by `mode`, else as listed). */
    saleProceeds: (state: GameState, propertyId: string, price: Cents, mode?: SaleMode) => {
      const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
      return owned ? saleProceeds(context(content, state, []), owned, price, mode) : null;
    },
    /**
     * Rents the player may ask today for a listing, a purchase under compromis
     * or an owned property, whether a new lease is allowed (indecent home,
     * DPE ban and its date), and the owner's monthly costs before any tax.
     */
    rentQuote: (state: GameState, id: string, leaseType: LeaseType) => {
      const property = findAnyProperty(state, id);
      if (!property) return null;
      const today = toDayNumber(state.clock.date);
      // Before buying, the rent reflects what the player knows of the items.
      const believed = believedView(content, property);
      const range = rentRange(content, state, believed, leaseType);
      return {
        ...range,
        block: lettingBlock(content, believed, today),
        banDay: letBanDay(content, property.dpe),
        /** Charges left to the owner, property tax and landlord insurance, per month. */
        monthlyOwnerCosts:
          property.monthlyCharges -
          recoverableCharges(content, property) +
          Math.round(property.annualPropertyTax / 12) +
          ownerInsurance(content, property),
        /** Monthly fee if he manages it himself from another city (an agency avoids it). */
        remoteManagementFee:
          property.cityId === state.player.baseCityId ? 0 : remoteManagementFee(content),
        furnitureCost: furnitureCost(content, property),
      };
    },
    /** This year's tax so far, and the cost of each regime for each let property. */
    estimateTaxes: (state: GameState) =>
      estimateRegimes(content, state, toDayNumber(state.clock.date)),
    /** Capital gains tax if an owned property sold today, `received` net of agency fees. */
    capitalGainsTax: (state: GameState, propertyId: string, received: Cents) => {
      const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
      return owned ? capitalGainsTax({ content, state }, owned, received) : null;
    },
    netWorth: (state: GameState) => netWorth(content, state),
    /**
     * Items of a listing, a purchase or an owned property, with their state
     * as the player knows it and the reference price of each tier.
     */
    worksCatalog: (state: GameState, id: string) => {
      const property = findAnyProperty(state, id);
      return property ? worksCatalog(content, state, property) : null;
    },
    /** What a transformation of an owned property would produce and cost (milestone 8). */
    transformationQuote: (state: GameState, propertyId: string, kind: TransformationKind) => {
      const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
      return owned ? transformationQuote(content, state, owned, kind) : null;
    },
    /** Leases an owned property may have (kind, rooms, SCI), in the order of content. */
    leaseOptions: (state: GameState, propertyId: string): LeaseType[] => {
      const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
      return owned ? leaseOptions(content, owned) : [];
    },
    /** The SCI's sheet: what it holds, owes and may still borrow (« Banque et SCI »). */
    companySheet: (state: GameState) =>
      companySheet(content, state, netWorth(content, state), companyAccountantFees(content, state)),
    /** Every transformation of an owned property: its quote and value after, or why not. */
    transformationOptions: (state: GameState, propertyId: string) => {
      const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
      if (!owned) return [];
      const kinds: TransformationKind[] = ['splitBuilding', 'division', 'attic', 'construction'];
      return kinds.map((kind) => ({
        kind,
        estimate: transformationEstimate(content, state, owned.property, kind),
      }));
    },
    /** A transformation's quote and the estimated value of what it produces, listed or owned. */
    transformationEstimate: (state: GameState, id: string, kind: TransformationKind) => {
      const property = findAnyProperty(state, id);
      return property ? transformationEstimate(content, state, property, kind) : null;
    },
    /** Reference cost, duration, DPE, value and rent after renovating these items. */
    worksEstimate: (
      state: GameState,
      id: string,
      choices: readonly ItemChoice[],
      diy: readonly ItemChoice[] = [],
    ) => {
      const property = findAnyProperty(state, id);
      return property ? worksEstimate(content, state, property, choices, diy) : null;
    },
    /** Schedule of a project (the « frise »): in progress, or with these quotes. */
    worksPlan: (
      state: GameState,
      propertyId: string,
      quoteIds?: readonly string[],
      diy?: readonly ItemChoice[],
    ) => {
      const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
      return owned ? worksPlan(content, state, owned, quoteIds, diy) : null;
    },
    /** Each loan: repaid share, interest paid and left, end, a cheaper bank (« Banque »). */
    loanSheets: (state: GameState) => loanSheets(content, state),
    /**
     * A negotiated departure of an owned property's tenant: the usual range of the indemnity
     * (in months of rent) and the day a new offer is possible; null without one.
     */
    buyoutTerms: (state: GameState, propertyId: string) => {
      const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
      const lease = owned?.lease;
      const range = lease ? content.renting.leaseTypes[lease.leaseType].buyoutMonths : null;
      if (!lease || !range || lease.noticeEndDay !== null) return null;
      return {
        months: range,
        retryDay: buyoutRetryDay(content, lease),
        minutes: content.renting.buyout.minutes,
        reputationPenalty: content.renting.buyout.reputationPenalty,
      };
    },
    /** Share buyers take off the price of an owned property sold with its tenant today. */
    occupiedDiscount: (state: GameState, propertyId: string) => {
      const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
      return owned ? occupiedDiscount(content, owned, toDayNumber(state.clock.date)) : 0;
    },
    /** Free time of a whole day today (the status bar shows what is left of it). */
    dailyFreeTime: (state: GameState) => dailyFreeTime(content, state, state.clock.date),
    /** Decisions waiting for the player, the most urgent first (« Décisions »). */
    pendingDecisions: (state: GameState) => pendingDecisions(content, state),
    /** Monthly flows of an owned property, before income tax. */
    cashFlow: (state: GameState, propertyId: string) => {
      const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
      return owned ? propertyCashFlow(content, state, owned) : null;
    },
    /** Financing of a listing (or a purchase under compromis) with a bank, as simulated today. */
    simulateFinancing: (state: GameState, id: string, input: FinancingInput) => {
      const listing = state.listings.find((candidate) => candidate.id === id);
      if (listing) {
        return simulateFinancing(content, state, listing.property, listing.askingPrice, input);
      }
      const purchase = state.purchases.find((candidate) => candidate.id === id);
      return purchase
        ? simulateFinancing(content, state, purchase.property, purchase.price, input, {
            id: purchase.id,
            holder: purchase.holder,
          })
        : null;
    },
    /**
     * « Cash-flow prévu » of a listing at its asking price or at `price` (an offer): financing
     * with the account bank, minimum contribution, bare let at the market rent (progression, step 3).
     */
    cashFlowOutlook: (state: GameState, listingId: string, price?: Cents) => {
      const listing = state.listings.find((candidate) => candidate.id === listingId);
      return listing
        ? cashFlowOutlook(content, state, listing.property, listing.askingPrice, price)
        : null;
    },
    /** Price per m² against the neighbourhood, rent, gross yield, estimate of a listing. */
    listingView: (state: GameState, listingId: string) => listingView(content, state, listingId),
    /** Sheets of the region map: every city, the base first. */
    citySheets: (state: GameState) => citySheets(content, state),
    /** Minutes and trip of a visit to a listing, as of now. */
    visitQuote: (state: GameState, listingId: string) => visitQuote(content, state, listingId),
    /** Sheet of one city. */
    citySheet: (state: GameState, cityId: string) => citySheet(content, state, cityId),
    /** Prices and rents of a city's neighbourhoods today (the map's colours). */
    neighbourhoodMarkets: (state: GameState, cityId: string) =>
      neighbourhoodMarkets(content, state, cityId),
    /** Net worth, values, debts and cash flows of the « Patrimoine » screen. */
    portfolio: (state: GameState) => portfolio(content, state),
    /** Expected balance over the next days (alert when it goes below zero). */
    cashForecast: (state: GameState, days?: number) => cashForecast(content, state, days),
    /** Pin of a listing, purchase or owned property on its city map. */
    mapPosition: (state: GameState, id: string) => {
      const property = findAnyProperty(state, id);
      return property ? mapPosition(content, property) : null;
    },
    /** Moment of the day, season, weather, Christmas and bells of a city (the living world). */
    ambience: (state: GameState, cityId: string) => ambience(content, state, cityId),
    /** Streets of a neighbourhood with their buildings and bubbles, left to right. */
    streets: (state: GameState, cityId: string, neighbourhoodId: string) =>
      streets(content, state, cityId, neighbourhoodId),
    /** Cross-section of a building of the street: flats or floors, rooms, artisans at work. */
    section: (state: GameState, cityId: string, neighbourhoodId: string, buildingId: string) =>
      section(content, state, cityId, neighbourhoodId, buildingId),
    /** Building of a listing, purchase or owned property, with its street (its façade). */
    building: (state: GameState, propertyId: string) => findBuilding(content, state, propertyId),
    /** Artisans of a city the player can call, with his history with each. */
    artisans: (state: GameState, cityId: string) =>
      knownArtisans(content, state, cityId).map((artisan) => ({
        artisan,
        jobs: state.artisans[artisan.id]?.jobs ?? 0,
        discount: artisanDiscount(content, state, artisan.id),
      })),
  };
}

function setFavorite(state: GameState, listingId: string, favorite: boolean): RefusalCode | null {
  if (!state.listings.some((listing) => listing.id === listingId)) return 'listing.unknown';
  state.favorites = state.favorites.filter((id) => id !== listingId);
  if (favorite) state.favorites.push(listingId);
  return null;
}

function findAnyProperty(state: GameState, id: string) {
  return (
    state.listings.find((candidate) => candidate.id === id)?.property ??
    state.purchases.find((candidate) => candidate.id === id)?.property ??
    state.properties.find((candidate) => candidate.property.id === id)?.property
  );
}

export type Engine = ReturnType<typeof createEngine>;

export { netWorth };

/** Short human-oriented identifier of the current game time, for logs and tools. */
export function describeTime(state: GameState): string {
  return `${toIsoDate(state.clock.date)} ${String(state.clock.hour).padStart(2, '0')}:00`;
}
