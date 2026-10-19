import {
  type GameEvent,
  type Holder,
  type LeaseType,
  type Listing,
  type OwnedProperty,
  visibleReliability,
} from '@cle/engine';
import type { BotApi, Strategy } from './driver.ts';
import { toDayNumber } from '@cle/engine';
import {
  chooseWorks,
  RenovationDesk,
  type RenovationProfile,
  type WorksProjectPlan,
} from './renovation.ts';

/**
 * The investor bots of docs/08-equilibrage.md (section 8.2), as profiles of
 * one decision routine. They play only through engine actions and see only
 * what the player sees: estimates, never real values.
 */
/** An investor who looks for properties beyond his base city (milestone 7). */
export interface ExpansionProfile {
  /** Cities he travels to. */
  cities: string[];
  /** Starts once he owns this many properties. */
  afterProperties: number;
  /** Agency managing what he owns far from his base (no fee, no trips for tenants). */
  remoteAgencyId: string | null;
  /** Extra margin asked of a faraway deal, for the trouble (share of the price). */
  premium: number;
  /** Visits planned per decision in another city: a day on site shares one trip. */
  visitsPerTrip: number;
}

/** An investor who buys through an SCI once his own credit runs out (milestone 8). */
export interface CompanyProfile {
  /** Creates the SCI once he owns this many properties. */
  afterProperties: number;
}

export interface InvestorProfile {
  id: string;
  /** Uses an SCI; undefined or null: buys in his own name only. */
  company?: CompanyProfile | null;
  /** Plays beyond his base city; undefined or null: stays in his base. */
  expansion?: ExpansionProfile | null;
  /** Answers the events by weighing their choices (a reader), rather than by default. */
  smartAnswers?: boolean;
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
  /** Skips properties that cannot be let (ruins, DPE bans) before milestone 3. */
  avoidRuins: boolean;
  /** Skips properties a DPE ban stops from being let within this many years (0: ignores it). */
  minLettableYears: number;
  leaseType: LeaseType;
  /** Rent asked, as a share of the market rent (within the allowed range). */
  rentShare: number;
  /** Managing agency; null: manages the lets himself. */
  agencyId: string | null;
  /** Takes the unpaid-rent insurance. */
  insured: boolean;
  /** Picks the candidate with the best file, or takes the first one. */
  tenantChoice: 'best' | 'first';
  /** Regime choice: follows the recommendation, or stays with the micro regime. */
  taxRegime: 'recommended' | 'micro';
  /** Banks asked for a loan, in order. */
  banks: string[];
  /** Banks met every month, to build trust. */
  meetBanks: string[];
  /** Accepts a bank's counter-proposal over a longer duration. */
  acceptsLongerLoans: boolean;
  /** Loan duration when works make at least 10 % of the project. */
  durationWithWorksYears: number;
  /** What it renovates, how (milestone 3). */
  renovation: RenovationProfile;
  /** Marchand de biens: buys to renovate and sells again instead of letting. */
  resell: boolean;
  /** Sells a property itself when the overdraft lasts, before the bank's forced sale. */
  sellsWhenOverdrawn: boolean;
  /** Judges a listing on its value after the bot's works (cost deducted), or as it is. */
  appraisal: 'afterWorks' | 'asIs';
}

const OFFER_STEP = 500_00;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;
/** Share of the year a let is expected to be vacant, in the bots' cash-flow estimate. */
const VACANCY_ALLOWANCE = 0.05;
/** A careful owner waits this long for several candidates, then takes the best one. */
const CANDIDATE_WAIT_DAYS = 5;
const DECEMBER = 12;

interface Appraisal {
  value: number;
  works: number;
  rentAfter: number | null;
}

interface Plan {
  holder: Holder;
  bankIds: string[];
  amount: number;
  works: number;
  durationYears: number;
  maxPrice: number;
}

/** Margin the bots put on the engine's estimate of works (hazards, artisans). */
const WORKS_MARGIN = 1.2;
/** A marchand's resale: asking price over the estimate, cut every month unsold. */
const RESALE_MARKUP = 1.03;
const RESALE_CUT = 0.03;
const RESALE_CUT_EVERY_DAYS = 30;
const RESALE_ACCEPT_SHARE = 0.95;
/** A bot sells a vacant property it cannot let after this long. */
const GIVE_UP_DAYS = 120;
/** A careful bot sells one property after this many days in overdraft. */
const OVERDRAFT_SELL_DAYS = 15;

interface Memory {
  startDay: number | null;
  maxPrice: Map<string, number>;
  /** Banks still to ask, by purchase id. */
  banksLeft: Map<string, string[]>;
  lastMeeting: Map<string, number>;
  /** Works financed with each purchase under compromis. */
  worksBudget: Map<string, number>;
  /** Last price change of each property for sale. */
  lastCut: Map<string, number>;
  /** First day a vacant property could not be let. */
  blockedSince: Map<string, number>;
  /** Properties sold to get out of an overdraft. */
  rescue: Set<string>;
  /** Properties whose works are completed. */
  renovated: Set<string>;
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
    worksBudget: new Map(),
    lastCut: new Map(),
    blockedSince: new Map(),
    rescue: new Set(),
    renovated: new Set(),
  };
  const desk = new RenovationDesk(profile.renovation);

  const feesShare = (api: BotApi) =>
    api.engine.content.credit.notaryFeesShare + api.engine.content.credit.bankFeesShare;

  const payments = (api: BotApi) =>
    api.state.loans.reduce((sum, loan) => sum + loan.monthlyPayment, 0);

  const reserve = (api: BotApi, extraPayment: number) =>
    Math.max(profile.reserveMin * 100, profile.reserveMonths * (payments(api) + extraPayment));

  /**
   * How the bot would finance a purchase at `price` with `works` (the loan
   * covers them), or null if it cannot or will not. `deposit` is cash
   * already paid at the compromis; `rentAfter` the market rent once renovated.
   */
  function plan(
    api: BotApi,
    price: number,
    rentId: string,
    deposit = 0,
    works = 0,
    rentAfter: number | null = null,
  ): Plan | null {
    const own = planFor(api, 'player', price, rentId, deposit, works, rentAfter);
    if (own || !profile.company || !api.state.company) return own;
    // His own credit exhausted: through the SCI, on the property's rent.
    return planFor(api, 'company', price, rentId, deposit, works, rentAfter);
  }

  function planFor(
    api: BotApi,
    holder: Holder,
    price: number,
    rentId: string,
    deposit = 0,
    works = 0,
    rentAfter: number | null = null,
  ): Plan | null {
    const { engine, state } = api;
    const fees = Math.round(price * feesShare(api));
    const companyShare =
      holder === 'company' ? engine.content.company.credit.extraContributionShare : 0;
    const contribution = fees + Math.round(price * (profile.extraContributionShare + companyShare));
    const amount = price + works + fees - contribution;
    const durationYears =
      works >= engine.content.credit.worksShareForLongerDuration * (price + works)
        ? profile.durationWithWorksYears
        : profile.durationYears;
    // A furnished let needs its furniture on top.
    const leaseType = leaseTypeFor(api, rentId);
    const furniture =
      leaseType !== null &&
      engine.content.renting.leaseTypes[leaseType].furnished &&
      !profile.resell
        ? (engine.rentQuote(state, rentId, 'furnished')?.furnitureCost ?? 0)
        : 0;
    const cash = state.player.balance + deposit - furniture;
    // The reserve only grows with the new loan's payment: short of it already, every bank fails.
    if (cash - contribution < reserve(api, 0)) return null;
    const rent = netRent(api, rentId, rentAfter);
    const bankIds: string[] = [];
    for (const bankId of profile.banks) {
      const decision = engine.evaluateLoan(state, {
        bankId,
        amount,
        durationYears,
        price,
        works,
        contribution: Math.min(cash, contribution),
        holder,
        propertyId: rentId,
      });
      if (decision.decision === 'refused' || decision.decision === 'partial') continue;
      if (decision.decision === 'counterOffer' && !profile.acceptsLongerLoans) continue;
      const offer = decision.offer;
      if (offer.debtRatioAfter > profile.maxDebtRatio) continue;
      if (cash - contribution < reserve(api, offer.monthlyPayment)) continue;
      if (profile.minCashFlow !== null && !profile.resell) {
        if (rent - offer.monthlyPayment < profile.minCashFlow * 100) continue;
      }
      bankIds.push(bankId);
    }
    return bankIds.length > 0
      ? { holder, bankIds, amount, works, durationYears, maxPrice: price }
      : null;
  }

  /** The property of a listing, a purchase or an owned property. */
  function propertyOf(api: BotApi, id: string) {
    const { state } = api;
    return (
      state.listings.find((l) => l.id === id)?.property ??
      state.purchases.find((p) => p.id === id)?.property ??
      state.properties.find((o) => o.property.id === id)?.property
    );
  }

  /**
   * The lease the bot would sign: a shop has its commercial lease, a parking space its own;
   * a property of the SCI is let bare; land is not let (null).
   */
  function leaseTypeFor(api: BotApi, id: string): LeaseType | null {
    const property = propertyOf(api, id);
    if (!property) return profile.leaseType;
    if (property.kind === 'commercial' || property.kind === 'parking') return property.kind;
    if (property.kind === 'land') return null;
    const held =
      api.state.properties.find((o) => o.property.id === id)?.holder ??
      api.state.purchases.find((p) => p.id === id)?.holder;
    const allowed = api.engine.content.company.leaseTypes;
    if (held === 'company' && !allowed.includes(profile.leaseType)) return 'bare';
    return profile.leaseType;
  }

  /** Monthly rent left after the owner's costs and the agency, before the loan and tax. */
  function netRent(api: BotApi, id: string, rentAfter: number | null = null): number {
    const { engine, state } = api;
    const leaseType = leaseTypeFor(api, id);
    if (leaseType === null) return 0;
    const quote = engine.rentQuote(state, id, leaseType);
    if (!quote) return 0;
    const leaseFactor = engine.content.renting.leaseTypes[leaseType].rentFactor;
    const market = rentAfter !== null ? rentAfter * leaseFactor : quote.block ? 0 : quote.market;
    const rent = market * profile.rentShare;
    const agencyId = agencyFor(api, id);
    const agency = engine.content.renting.agencies.find((a) => a.id === agencyId);
    const insurance = profile.insured ? engine.content.renting.unpaidRentInsurance.premiumShare : 0;
    // Managed from afar without an agency, a property costs its monthly fee.
    const remoteFee = agencyId === null ? quote.remoteManagementFee : 0;
    return (
      rent * (1 - VACANCY_ALLOWANCE) * (1 - (agency?.feeShare ?? 0) - insurance) -
      quote.monthlyOwnerCosts -
      remoteFee
    );
  }

  /** The property can be let now, and long enough for this bot. */
  function lettable(api: BotApi, id: string): boolean {
    const leaseType = leaseTypeFor(api, id);
    if (leaseType === null) return false;
    const quote = api.engine.rentQuote(api.state, id, leaseType);
    if (!quote || quote.block) return false;
    if (profile.minLettableYears === 0 || quote.banDay === null) return true;
    return quote.banDay - api.today > profile.minLettableYears * DAYS_PER_YEAR;
  }

  /** Offers the property on the bot's terms; bare if it cannot pay for the furniture. */
  function offerForRent(api: BotApi, owned: OwnedProperty): void {
    const id = owned.property.id;
    const wanted = leaseTypeFor(api, id);
    if (wanted === null) return;
    const affordable =
      owned.furniture !== null ||
      (api.engine.rentQuote(api.state, id, 'furnished')?.furnitureCost ?? 0) <=
        api.state.player.balance;
    const furnished = api.engine.content.renting.leaseTypes[wanted].furnished;
    const leaseType = furnished && !affordable ? 'bare' : wanted;
    const quote = api.engine.rentQuote(api.state, id, leaseType);
    if (!quote || quote.block) return;
    const monthlyRent = Math.min(
      quote.max,
      Math.max(quote.min, Math.round((quote.market * profile.rentShare) / 100) * 100),
    );
    api.act({
      type: 'rent/list',
      propertyId: id,
      leaseType,
      monthlyRent,
      agencyId: agencyFor(api, id),
      insured: profile.insured,
    });
  }

  /** Offers vacant properties, picks tenants, fixes incidents; sets the tax regimes in December. */
  function manageLets(api: BotApi): void {
    const { engine } = api;
    for (const owned of [...api.state.properties]) {
      const id = owned.property.id;
      if (!owned.lease && !owned.rental && !owned.sale) offerForRent(api, owned);
      const rental = api.state.properties.find((o) => o.property.id === id)?.rental;
      if (rental && rental.agencyId === null && rental.applications.length > 0) {
        const waited = api.today - rental.listedDay >= CANDIDATE_WAIT_DAYS;
        const ranked = [...rental.applications].sort(
          (a, b) =>
            visibleReliability(engine.content, b.tenant, rental.monthlyRent) -
            visibleReliability(engine.content, a.tenant, rental.monthlyRent),
        );
        const choice =
          profile.tenantChoice === 'first'
            ? rental.applications[0]
            : waited || rental.applications.length >= 3
              ? ranked[0]
              : undefined;
        if (choice) api.act({ type: 'rent/accept', propertyId: id, applicationId: choice.id });
      }
      const incident = owned.lease?.incident;
      if (incident && !incident.repair) {
        if (!api.act({ type: 'rent/repair', propertyId: id, method: 'self' })) {
          api.act({ type: 'rent/repair', propertyId: id, method: 'artisan' });
        }
      }
    }
    if (api.state.clock.date.month !== DECEMBER || api.state.clock.date.day !== 1) return;
    if (profile.taxRegime === 'micro') {
      for (const owned of api.state.properties) {
        if (owned.taxRegime !== 'micro') {
          api.act({ type: 'tax/setRegime', propertyId: owned.property.id, regime: 'micro' });
        }
      }
      return;
    }
    for (const estimate of engine.estimateTaxes(api.state).properties) {
      api.act({
        type: 'tax/setRegime',
        propertyId: estimate.propertyId,
        regime: estimate.recommended,
      });
    }
  }

  function meetBanks(api: BotApi): void {
    for (const bankId of profile.meetBanks) {
      const last = memory.lastMeeting.get(bankId);
      if (last !== undefined && api.today - last < DAYS_PER_MONTH) continue;
      if (api.act({ type: 'bank/meet', bankId })) memory.lastMeeting.set(bankId, api.today);
    }
  }

  function offer(
    api: BotApi,
    listing: Listing,
    estimate: number,
    works = 0,
    rentAfter: number | null = null,
  ): void {
    const maxPrice =
      profile.buyRatio > 0 ? roundDown(estimate / profile.buyRatio) : listing.askingPrice;
    const share =
      listing.offersMade === 0 ? profile.firstOfferShare : (1 + profile.firstOfferShare) / 2;
    const amount = Math.min(
      maxPrice,
      listing.askingPrice,
      Math.max(OFFER_STEP, roundDown(listing.askingPrice * share)),
    );
    if (!plan(api, Math.min(listing.askingPrice, maxPrice), listing.id, 0, works, rentAfter))
      return;
    // Before committing: an artisan's look at the wiring, plumbing and heating it could not see.
    if (diagnoseCritical(api, listing)) {
      const fresh = api.state.listings.find((l) => l.id === listing.id);
      const appraisal = fresh ? appraise(api, fresh) : null;
      if (!fresh || !appraisal) return;
      if (appraisal.value / fresh.askingPrice < profile.buyRatio) return;
      offer(api, fresh, appraisal.value, appraisal.works, appraisal.rentAfter);
      return;
    }
    if (api.act({ type: 'market/offer', listingId: listing.id, amount })) {
      memory.maxPrice.set(listing.id, Math.min(maxPrice, listing.askingPrice));
    }
  }

  /** Pays for a diagnosis of each critical trade still unknown; true if one was made. */
  function diagnoseCritical(api: BotApi, listing: Listing): boolean {
    if (!profile.visits || profile.renovation.scope === 'none') return false;
    const catalog = api.engine.worksCatalog(api.state, listing.id) ?? [];
    const trades = new Set(
      catalog
        .filter((item) => item.state === null && item.trade !== null)
        .filter((item) => api.engine.content.works.items[item.kind].critical)
        .map((item) => item.trade),
    );
    let done = false;
    for (const trade of trades) {
      if (trade && api.act({ type: 'market/diagnose', listingId: listing.id, trade })) done = true;
    }
    return done;
  }

  /**
   * Appraisals of frozen listings (shared by the copies of the state, replaced when they change).
   * Besides the listing, an appraisal depends only on its neighbourhood's price index, the
   * desk's works project for it and which DPE ban dates (and the bot's horizon before them)
   * are past: the result is the same as recomputing it, without the work.
   */
  const appraisals = new WeakMap<
    Listing,
    {
      priceIndex: number;
      project: WorksProjectPlan | null;
      flags: string;
      value: Appraisal | null;
    }
  >();

  let banFlagsCache: { day: number; flags: string } | null = null;

  /** Which ban dates, and which ban dates minus the bot's horizon, are past today. */
  function banFlags(api: BotApi): string {
    const today = api.today;
    if (banFlagsCache?.day === today) return banFlagsCache.flags;
    const horizon = profile.minLettableYears * DAYS_PER_YEAR;
    let flags = '';
    for (const iso of Object.values(api.engine.content.renting.dpe.letBanFrom)) {
      if (!iso) continue;
      const [year, month, day] = iso.split('-').map(Number);
      const banDay = toDayNumber({ year: year ?? 0, month: month ?? 1, day: day ?? 1 });
      flags += `${today >= banDay ? 1 : 0}${today >= banDay - horizon ? 1 : 0}`;
    }
    banFlagsCache = { day: today, flags };
    return flags;
  }

  function appraise(api: BotApi, listing: Listing): Appraisal | null {
    const project = desk.projectFor(api, listing);
    if (!Object.isFrozen(listing)) return appraiseNow(api, listing, project);
    const { property } = listing;
    const priceIndex =
      api.state.market.cities[property.cityId]?.[property.neighbourhoodId]?.priceIndex ?? 1;
    const flags = banFlags(api);
    const cached = appraisals.get(listing);
    if (
      cached &&
      cached.priceIndex === priceIndex &&
      cached.project === project &&
      cached.flags === flags
    ) {
      return cached.value;
    }
    const value = appraiseNow(api, listing, project);
    appraisals.set(listing, { priceIndex, project, flags, value });
    return value;
  }

  /** What the bot would pay for a listing: the value after its works, the works deducted. */
  function appraiseNow(
    api: BotApi,
    listing: Listing,
    project: WorksProjectPlan | null,
  ): Appraisal | null {
    const { engine, state } = api;
    if (project && profile.appraisal === 'asIs') {
      // Premium everywhere: bought on its value as it is, the works financed on top.
      const value = engine.estimate(state, listing.id)?.estimate ?? 0;
      const works = Math.round(project.estimate.cost * WORKS_MARGIN);
      if (project.estimate.blockAfter) return null;
      return { value, works, rentAfter: project.estimate.rentAfter };
    }
    if (!project) {
      if (profile.resell) return null;
      if (profile.avoidRuins && !lettable(api, listing.id)) return null;
      const estimate = engine.estimate(state, listing.id)?.estimate ?? 0;
      return { value: estimate, works: 0, rentAfter: null };
    }
    const { estimate } = project;
    if (!profile.resell && profile.avoidRuins) {
      if (estimate.blockAfter) return null;
      const ban = engine.content.renting.dpe.letBanFrom[estimate.dpeAfter];
      if (ban && profile.minLettableYears > 0) {
        const [year, month, day] = ban.split('-').map(Number);
        const banDay = toDayNumber({ year: year ?? 0, month: month ?? 1, day: day ?? 1 });
        if (banDay - api.today <= profile.minLettableYears * DAYS_PER_YEAR) return null;
      }
    }
    const works = Math.round(estimate.cost * WORKS_MARGIN);
    return { value: estimate.valueAfter - works, works, rentAfter: estimate.rentAfter };
  }

  const expansion = profile.expansion ?? null;

  /** Cities where the bot looks for properties: its base, then the cities it expands to. */
  function workCities(api: BotApi): string[] {
    const base = api.state.player.baseCityId;
    if (!expansion || api.state.properties.length < expansion.afterProperties) return [base];
    return [base, ...expansion.cities.filter((cityId) => cityId !== base)];
  }

  /** City of a listing, a purchase or an owned property. */
  function cityOf(api: BotApi, id: string): string {
    const { state } = api;
    return (
      state.listings.find((l) => l.id === id)?.property.cityId ??
      state.purchases.find((p) => p.id === id)?.property.cityId ??
      state.properties.find((o) => o.property.id === id)?.property.cityId ??
      state.player.baseCityId
    );
  }

  const isRemote = (api: BotApi, id: string) => cityOf(api, id) !== api.state.player.baseCityId;

  /** Agency of a property: far from home, the expansion's agency when there is one. */
  function agencyFor(api: BotApi, id: string): string | null {
    return expansion?.remoteAgencyId && isRemote(api, id)
      ? expansion.remoteAgencyId
      : profile.agencyId;
  }

  function candidates(api: BotApi) {
    const { state } = api;
    const limit = api.engine.content.market.negotiation.maxOffersPerListing;
    const result: {
      listing: Listing;
      estimate: number;
      ratio: number;
      works: number;
      rentAfter: number | null;
    }[] = [];
    desk.forget(new Set(state.listings.map((l) => l.id)));
    const cities = workCities(api);
    for (const listing of state.listings) {
      if (!cities.includes(listing.property.cityId)) continue;
      if (listing.offer || listing.offersMade >= limit || api.today < listing.publicDay) continue;
      const appraisal = appraise(api, listing);
      if (!appraisal || appraisal.value <= 0) continue;
      const trouble =
        listing.property.cityId === state.player.baseCityId ? 1 : 1 + (expansion?.premium ?? 0);
      const ratio = appraisal.value / listing.askingPrice / trouble;
      if (ratio < profile.screenRatio) continue;
      result.push({
        listing,
        estimate: appraisal.value,
        ratio,
        works: appraisal.works,
        rentAfter: appraisal.rentAfter,
      });
    }
    return result.sort((a, b) => b.ratio - a.ratio);
  }

  /**
   * Properties for sale: the marchand's renovated ones, and those a bot gave
   * up on (vacant, impossible to let and no money for the works). Offers
   * close enough to the asking price are accepted, the price drops monthly.
   */
  function manageSales(api: BotApi): void {
    // In overdraft for a while: sell the property that frees the most cash before the bank does.
    const { player } = api.state;
    if (
      profile.sellsWhenOverdrawn &&
      player.overdraftDays >= OVERDRAFT_SELL_DAYS &&
      !api.state.properties.some((owned) => owned.sale)
    ) {
      const equity = (owned: OwnedProperty) =>
        (api.engine.estimate(api.state, owned.property.id)?.estimate ?? 0) -
        api.state.loans
          .filter((loan) => loan.propertyId === owned.property.id)
          .reduce((sum, loan) => sum + loan.remaining, 0);
      const best = api.state.properties
        .filter((owned) => !owned.works)
        .sort((a, b) => equity(b) - equity(a))[0];
      if (best) memory.rescue.add(best.property.id);
    }
    for (const owned of [...api.state.properties]) {
      const id = owned.property.id;
      if (owned.works) continue;
      const sale = owned.sale;
      if (!sale) {
        if (memory.rescue.has(id)) {
          // Sold to get out of the overdraft.
        } else if (!profile.resell) {
          // Given up: vacant and impossible to let for months.
          const blocked = !owned.lease && api.engine.rentQuote(api.state, id, 'bare')?.block;
          if (!blocked) {
            memory.blockedSince.delete(id);
            continue;
          }
          const since = memory.blockedSince.get(id) ?? api.today;
          memory.blockedSince.set(id, since);
          if (api.today - since < GIVE_UP_DAYS) continue;
        }
        // Ready once renovated (or with nothing to renovate).
        else if (!memory.renovated.has(id) && chooseWorks(api, id, profile.renovation)) continue;
        const estimate = api.engine.estimate(api.state, id)?.estimate ?? 0;
        if (estimate <= 0) continue;
        const askingPrice = Math.round((estimate * RESALE_MARKUP) / OFFER_STEP) * OFFER_STEP;
        if (
          api.act({
            type: 'sale/list',
            propertyId: id,
            askingPrice,
            mode: profile.resell ? 'self' : 'agency',
          })
        ) {
          memory.lastCut.set(id, api.today);
        }
        continue;
      }
      if (sale.agreement) continue;
      for (const received of [...sale.offers]) {
        if (received.counterAmount !== null) continue;
        const accept = received.amount >= sale.askingPrice * RESALE_ACCEPT_SHARE;
        api.act({
          type: accept ? 'sale/acceptOffer' : 'sale/rejectOffer',
          propertyId: id,
          offerId: received.id,
        });
        if (accept) break;
      }
      const last = memory.lastCut.get(id) ?? sale.listedDay;
      const current = api.state.properties.find((o) => o.property.id === id)?.sale;
      if (current && !current.agreement && api.today - last >= RESALE_CUT_EVERY_DAYS) {
        const askingPrice =
          Math.round((current.askingPrice * (1 - RESALE_CUT)) / OFFER_STEP) * OFFER_STEP;
        if (api.act({ type: 'sale/update', propertyId: id, askingPrice })) {
          memory.lastCut.set(id, api.today);
        }
      }
    }
  }

  /** Creates the SCI once his portfolio is under way and the cash is there. */
  function createCompany(api: BotApi): void {
    const company = profile.company;
    if (!company || api.state.company) return;
    if (api.state.properties.length < company.afterProperties) return;
    const cost = api.engine.content.company.creationCost * 100;
    if (api.state.player.balance - cost < reserve(api, 0)) return;
    api.act({ type: 'company/create' });
  }

  function daily(api: BotApi): void {
    memory.startDay ??= api.today;
    createCompany(api);
    desk.daily(api, reserve(api, 0), () => false);
    manageSales(api);
    if (!profile.resell) manageLets(api);
    if ((api.today - memory.startDay) % profile.decisionEveryDays !== 0) return;
    meetBanks(api);
    const { state } = api;
    if (state.purchases.length > 0) return;
    if (state.listings.some((listing) => listing.offer)) return;
    const found = candidates(api);
    if (profile.pick === 'random') {
      const affordable = found.filter((c) =>
        plan(api, c.listing.askingPrice, c.listing.id, 0, c.works, c.rentAfter),
      );
      const choice = affordable[Math.floor(api.random() * affordable.length)];
      if (choice) offer(api, choice.listing, choice.estimate, choice.works, choice.rentAfter);
      return;
    }
    if (!profile.visits) {
      const best = found.find((c) => c.ratio >= profile.buyRatio);
      if (best) offer(api, best.listing, best.estimate, best.works, best.rentAfter);
      return;
    }
    // Offer on the best listing already visited, otherwise visit the most promising ones.
    const visited = found.find((c) => c.listing.visited && c.ratio >= profile.buyRatio);
    if (visited) {
      offer(api, visited.listing, visited.estimate, visited.works, visited.rentAfter);
      return;
    }
    let planned = 0;
    let plannedFar = 0;
    const base = state.player.baseCityId;
    // Visits already waiting in the agenda far from home: they share the next day on site.
    const waitingFar = state.agenda.filter(
      (item) => item.kind === 'visit' && isRemote(api, item.listingId),
    ).length;
    for (const candidate of found) {
      const { listing } = candidate;
      const far = listing.property.cityId !== base;
      if (far) {
        if (!expansion || plannedFar + waitingFar >= expansion.visitsPerTrip) continue;
      } else if (planned >= profile.visitsPerDay) {
        continue;
      }
      if (
        listing.visited ||
        state.agenda.some((item) => item.kind === 'visit' && item.listingId === listing.id)
      )
        continue;
      // Only worth a visit if the bot could finance it at the asking price.
      const price = Math.min(listing.askingPrice, candidate.estimate);
      if (!plan(api, price, listing.id, 0, candidate.works, candidate.rentAfter)) continue;
      if (!api.act({ type: 'market/visit', listingId: listing.id })) break;
      if (far) plannedFar += 1;
      else planned += 1;
    }
  }

  function askNextBank(api: BotApi, purchaseId: string): void {
    const purchase = api.state.purchases.find((p) => p.id === purchaseId);
    if (!purchase) return;
    const banks = memory.banksLeft.get(purchaseId) ?? [];
    while (banks.length > 0) {
      const bankId = banks.shift();
      if (!bankId) break;
      const works = memory.worksBudget.get(purchaseId) ?? 0;
      const financing = planFor(
        api,
        purchase.holder,
        purchase.price,
        purchaseId,
        purchase.deposit,
        works,
      );
      const amount = financing?.amount ?? purchase.price + works;
      if (
        api.act({
          type: 'purchase/requestLoan',
          purchaseId,
          bankId,
          amount,
          durationYears: financing?.durationYears ?? profile.durationYears,
          works,
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
      const envelope = Math.min(memory.worksBudget.get(purchase.id) ?? 0, decision.offer.amount);
      const due = purchase.price + fees - purchase.deposit - (decision.offer.amount - envelope);
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
        const project = chooseWorks(api, purchase.id, profile.renovation);
        const works = project ? Math.round(project.estimate.cost * WORKS_MARGIN) : 0;
        memory.worksBudget.set(purchase.id, works);
        const financing = plan(
          api,
          purchase.price,
          purchase.id,
          purchase.deposit,
          works,
          project?.estimate.rentAfter ?? null,
        );
        if (financing?.holder === 'company') {
          api.act({ type: 'purchase/setHolder', purchaseId: purchase.id, holder: 'company' });
        }
        memory.banksLeft.set(purchase.id, financing ? [...financing.bankIds] : [...profile.banks]);
        askNextBank(api, purchase.id);
        return;
      }
      case 'loanAnswered':
        onLoanAnswer(api, event);
        return;
      case 'worksCompleted':
        memory.renovated.add(event.propertyId);
        return;
      case 'offerAnswered': {
        if (event.answer !== 'counterOffer') return;
        const maxPrice = memory.maxPrice.get(event.listingId) ?? 0;
        const listing = api.state.listings.find((l) => l.id === event.listingId);
        const appraisal = listing ? appraise(api, listing) : null;
        api.act({
          type: 'market/answerCounter',
          listingId: event.listingId,
          accept:
            event.amount <= maxPrice &&
            plan(
              api,
              event.amount,
              event.listingId,
              0,
              appraisal?.works ?? 0,
              appraisal?.rentAfter ?? null,
            ) !== null,
        });
        return;
      }
      default:
        return;
    }
  }

  return {
    id: profile.id,
    answers: profile.smartAnswers ? 'smart' : 'default',
    daily,
    onEvent,
  };
}

const BANKS_BY_RATE = ['rigueur', 'tirelire', 'zeroPapier', 'fougueux'];

const BASE_PROFILES = {
  prudent: {
    id: 'prudent',
    smartAnswers: true,
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
    minLettableYears: 8,
    leaseType: 'bare',
    rentShare: 1,
    agencyId: null,
    insured: true,
    tenantChoice: 'best',
    taxRegime: 'recommended',
    durationWithWorksYears: 20,
    renovation: {
      scope: 'energy',
      tier: 'standard',
      maxState: 2,
      targetDpe: 'D',
      artisans: 'reliable',
      hazard: 'treat',
    },
    resell: false,
    sellsWhenOverdrawn: true,
    appraisal: 'afterWorks',
  },
  levier: {
    id: 'levier',
    smartAnswers: true,
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
    minLettableYears: 2,
    leaseType: 'furnished',
    rentShare: 1.05,
    agencyId: 'bonnePioche',
    insured: false,
    tenantChoice: 'best',
    taxRegime: 'recommended',
    durationWithWorksYears: 27,
    renovation: {
      scope: 'energy',
      tier: 'eco',
      maxState: 2,
      targetDpe: 'D',
      artisans: 'cheapest',
      hazard: 'eco',
    },
    resell: false,
    sellsWhenOverdrawn: false,
    appraisal: 'afterWorks',
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
    minLettableYears: 0,
    leaseType: 'bare',
    rentShare: 1.15,
    agencyId: null,
    insured: false,
    tenantChoice: 'first',
    taxRegime: 'micro',
    durationWithWorksYears: 27,
    renovation: {
      scope: 'none',
      tier: 'standard',
      maxState: 1,
      targetDpe: 'G',
      artisans: 'cheapest',
      hazard: 'treat',
    },
    resell: false,
    sellsWhenOverdrawn: false,
    appraisal: 'afterWorks',
  },
  chasseur: {
    id: 'chasseur',
    company: { afterProperties: 2 },
    smartAnswers: true,
    visits: true,
    visitsPerDay: 4,
    screenRatio: 1.03,
    buyRatio: 1.1,
    firstOfferShare: 0.92,
    pick: 'best',
    decisionEveryDays: 1,
    reserveMonths: 5,
    reserveMin: 4000,
    extraContributionShare: 0,
    durationYears: 25,
    maxDebtRatio: 0.35,
    minCashFlow: -50,
    avoidRuins: true,
    banks: BANKS_BY_RATE,
    meetBanks: ['tirelire'],
    acceptsLongerLoans: false,
    minLettableYears: 5,
    leaseType: 'bare',
    rentShare: 1,
    agencyId: null,
    insured: false,
    tenantChoice: 'best',
    taxRegime: 'recommended',
    durationWithWorksYears: 27,
    renovation: {
      scope: 'energy',
      tier: 'standard',
      maxState: 2,
      targetDpe: 'D',
      artisans: 'cheapest',
      hazard: 'treat',
    },
    resell: false,
    sellsWhenOverdrawn: true,
    appraisal: 'afterWorks',
  },
  marchand: {
    id: 'marchand',
    smartAnswers: true,
    visits: true,
    visitsPerDay: 3,
    screenRatio: 1.12,
    buyRatio: 1.22,
    firstOfferShare: 0.9,
    pick: 'best',
    decisionEveryDays: 1,
    reserveMonths: 3,
    reserveMin: 3000,
    extraContributionShare: 0,
    durationYears: 20,
    maxDebtRatio: 0.35,
    minCashFlow: null,
    avoidRuins: false,
    banks: BANKS_BY_RATE,
    meetBanks: ['tirelire'],
    acceptsLongerLoans: false,
    minLettableYears: 0,
    leaseType: 'bare',
    rentShare: 1,
    agencyId: null,
    insured: false,
    tenantChoice: 'best',
    taxRegime: 'recommended',
    durationWithWorksYears: 20,
    renovation: {
      scope: 'profitable',
      tier: 'standard',
      maxState: 3,
      targetDpe: 'C',
      artisans: 'cheapest',
      hazard: 'eco',
    },
    resell: true,
    sellsWhenOverdrawn: true,
    appraisal: 'afterWorks',
  },
  renovateur: {
    id: 'renovateur',
    smartAnswers: true,
    visits: true,
    visitsPerDay: 2,
    screenRatio: 1,
    buyRatio: 1.0,
    firstOfferShare: 0.94,
    pick: 'best',
    decisionEveryDays: 1,
    reserveMonths: 3,
    reserveMin: 3000,
    extraContributionShare: 0,
    durationYears: 25,
    maxDebtRatio: 0.35,
    minCashFlow: -100,
    avoidRuins: true,
    banks: BANKS_BY_RATE,
    meetBanks: ['tirelire'],
    acceptsLongerLoans: false,
    minLettableYears: 5,
    leaseType: 'bare',
    rentShare: 1,
    agencyId: null,
    insured: false,
    tenantChoice: 'best',
    taxRegime: 'recommended',
    durationWithWorksYears: 27,
    renovation: {
      scope: 'full',
      tier: 'premium',
      maxState: 4,
      targetDpe: 'B',
      artisans: 'reliable',
      hazard: 'treat',
    },
    resell: false,
    sellsWhenOverdrawn: true,
    appraisal: 'asIs',
  },
} as const satisfies Record<string, InvestorProfile>;

/** The Chasseur who also looks in one city, with a local agency managing what he buys there. */
function expandingHunter(id: string, cityId: string): InvestorProfile {
  return {
    ...BASE_PROFILES.chasseur,
    id,
    banks: [...BASE_PROFILES.chasseur.banks],
    meetBanks: [...BASE_PROFILES.chasseur.meetBanks],
    renovation: { ...BASE_PROFILES.chasseur.renovation },
    expansion: {
      cities: [cityId],
      afterProperties: 1,
      remoteAgencyId: 'immoZen',
      premium: 0.02,
      visitsPerTrip: 3,
    },
  };
}

export const PROFILES = {
  ...BASE_PROFILES,
  chasseurDijon: expandingHunter('chasseurDijon', 'dijon'),
  chasseurBesancon: expandingHunter('chasseurBesancon', 'besancon'),
  chasseurChalon: expandingHunter('chasseurChalon', 'chalon'),
} satisfies Record<string, InvestorProfile>;

export const inactive: Strategy = { id: 'inactif' };

export type BotId = keyof typeof PROFILES | 'inactif';
export const BOT_IDS: readonly BotId[] = [
  'prudent',
  'levier',
  'naif',
  'chasseur',
  'marchand',
  'renovateur',
  'chasseurDijon',
  'chasseurBesancon',
  'chasseurChalon',
  'inactif',
];

export const BOT_NAMES: Record<BotId, string> = {
  prudent: 'Prudent',
  levier: 'Levier maximal',
  naif: 'Naïf',
  chasseur: 'Chasseur de bonnes affaires',
  marchand: 'Marchand de biens',
  renovateur: 'Rénovateur premium',
  chasseurDijon: 'Chasseur à Dijon',
  chasseurBesancon: 'Chasseur à Besançon',
  chasseurChalon: 'Chasseur à Chalon',
  inactif: 'Inactif',
};

/** A fresh strategy (bots keep a little memory: one per game). */
export function createStrategy(id: BotId): Strategy {
  if (id === 'inactif') return inactive;
  const base: InvestorProfile = PROFILES[id];
  return investor({
    ...base,
    banks: [...base.banks],
    meetBanks: [...base.meetBanks],
    renovation: { ...base.renovation },
    expansion: base.expansion ? { ...base.expansion, cities: [...base.expansion.cities] } : null,
    smartAnswers: base.smartAnswers ?? false,
  });
}
