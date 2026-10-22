import { jobs, gameContent } from '@cle/content';
import type { GameMetrics } from './metrics.ts';
import { BOT_IDS, BOT_NAMES, type BotId } from './strategies.ts';

/**
 * Balancing report (docs/08-equilibrage.md, section 8.5): distributions by
 * bot, and the targets of section 8.1 and 8.2 checked one by one.
 */

const DAYS_PER_YEAR = 365;
const DAYS_PER_MONTH = 365 / 12;

export interface BotSummary {
  botId: BotId;
  games: number;
  bankruptShare: number;
  forcedSaleShare: number;
  boughtShare: number;
  /** Months to the first deed, over games that bought (median). */
  firstPurchaseMonths: number | null;
  firstPurchaseInWindowShare: number;
  /** Median, over all games, of the years to reach a milestone (Infinity when most never do). */
  bailleurYears: number;
  bailleurShare: number;
  seasonedYears: number;
  seasonedShare: number;
  /** Net worth percentiles by year (index 0 = year 1), in euros. */
  netWorth: { p10: number[]; p50: number[]; p90: number[] };
  maxFinalNetWorth: number;
  medianProperties: number;
  medianMonthlyRent: number;
  medianDebtRatio: number;
  medianVisits: number;
  medianOffers: number;
  meanLostToRivals: number;
  meanRivalOffers: number;
  rivalPurchasesPerYear: Record<string, number>;
  /** Median final net worth by job. */
  byJob: Record<string, number>;
  renting: {
    /** Share of property-months let. */
    occupancy: number;
    /** Per property and year. */
    rentMissed: number;
    incidents: number;
    departures: number;
    /** Share of games with at least one eviction. */
    evictionShare: number;
    /** Means per game and year, in euros. */
    rentTaxPerYear: number;
    propertyTaxPerYear: number;
    accountantPerYear: number;
    capitalGainsTax: number;
    /** Shares of assessed property-years. */
    realRegimeShare: number;
    furnishedShare: number;
  };
  /** Density of decisions (docs/03-systemes/07) and progression (docs/02, 2.8 to 2.10). */
  rhythm: {
    /** Real seconds at ×1 (automatic acceleration on) per decision, over all games. */
    interval: number;
    intervalByJob: Record<string, number>;
    decisionsPerYear: number;
    catalogPerYear: number;
    interestingPerYear: number;
    challengesPerYear: number;
    challengesWonPerYear: number;
    anecdotesPerYear: number;
    /** Share of the game time the acceleration would run. */
    calmShare: number;
    /** Real hours a year of play. */
    realHoursPerYear: number;
    medianAchievements: number;
    medianReputation: number;
    /** Share of games earning each title, and the median years over those that do. */
    titles: Record<string, { share: number; years: number | null; within10: number }>;
  };
  /** Cities (milestone 7): trips, remote deeds and the number of cities held. */
  cities: {
    /** Share of games with at least one deed outside the base city. */
    remoteBuyerShare: number;
    /** Months to the first remote deed, over the games that had one (median). */
    firstRemoteMonths: number | null;
    /** Deeds outside the base city, per game. */
    remotePurchases: number;
    /** Per game and year: trips, hours on the road, cost and remote management fees (euros). */
    tripsPerYear: number;
    tripHoursPerYear: number;
    tripCostPerYear: number;
    remoteFeesPerYear: number;
    /** Share of games ending with properties in two cities or more, and the median number. */
    twoCitiesShare: number;
    medianCities: number;
    /** Median final local renown, by city. */
    medianRenown: Record<string, number>;
    /** Among the games with a remote deed: hours on the road per year, and median final net worth. */
    buyersTripHoursPerYear: number;
    buyersNetWorth: number | null;
  };
  works: {
    /** Means per game. */
    projects: number;
    cost: number;
    hazardsPerProject: number;
    dpeClassesGained: number;
    sales: number;
    /** Share of the properties held at the end that are classed E to G. */
    passoireShare: number;
  };
  /** Depth (milestone 8): the SCI, transformations, the IFI and SCI Horizon. */
  depth: {
    /** Share of games creating the SCI, and the median years to it (over those games). */
    companyShare: number;
    companyYears: number | null;
    /** Median properties the SCI holds at the end (over the games that created it). */
    companyProperties: number;
    /** Transformations per game. */
    transformations: number;
    /** Share of games paying the IFI at least once, and the mean paid per game (euros). */
    wealthTaxShare: number;
    wealthTax: number;
    /** Share of games where SCI Horizon arrives, and the median years to it. */
    horizonShare: number;
    horizonYears: number | null;
  };
}

export interface TargetCheck {
  label: string;
  target: string;
  measured: string;
  /** null: shown for information, no pass or fail. */
  ok: boolean | null;
}

export interface Report {
  games: number;
  years: number;
  summaries: BotSummary[];
  checks: TargetCheck[];
}

function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const a = sorted[low] ?? 0;
  const b = sorted[high] ?? a;
  return a + (b - a) * (position - low);
}

const median = (values: readonly number[]) => quantile(values, 0.5);
const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
const share = (values: readonly boolean[]) =>
  values.length === 0 ? 0 : values.filter(Boolean).length / values.length;

/** Net worth at each anniversary; a bankrupt game keeps its last value. */
function yearlyNetWorth(game: GameMetrics, years: number): number[] {
  const values: number[] = [];
  for (let year = 0; year < years; year++) {
    values.push(game.netWorthByYear[year] ?? game.finalNetWorth);
  }
  return values;
}

function yearsOrInfinity(day: number | null): number {
  return day === null ? Number.POSITIVE_INFINITY : day / DAYS_PER_YEAR;
}

function summarize(botId: BotId, games: GameMetrics[], years: number): BotSummary {
  const curves = games.map((game) => yearlyNetWorth(game, years));
  const atYear = (year: number) => curves.map((curve) => curve[year] ?? 0);
  const percentiles = (q: number) =>
    Array.from({ length: years }, (_, y) => quantile(atYear(y), q));
  const bought = games.filter((game) => game.firstPurchaseDay !== null);
  const firstMonths = bought.map((game) => (game.firstPurchaseDay ?? 0) / DAYS_PER_MONTH);
  const rivalTotals: Record<string, number> = {};
  for (const game of games) {
    for (const [rivalId, count] of Object.entries(game.rivalPurchases)) {
      rivalTotals[rivalId] = (rivalTotals[rivalId] ?? 0) + count / Math.max(1, game.days / 365);
    }
  }
  const byJob: Record<string, number> = {};
  for (const job of jobs) {
    const ofJob = games.filter((game) => game.jobId === job.id);
    if (ofJob.length > 0) byJob[job.id] = median(ofJob.map((game) => game.finalNetWorth));
  }
  return {
    botId,
    games: games.length,
    bankruptShare: share(games.map((game) => game.bankruptDay !== null)),
    forcedSaleShare: share(games.map((game) => game.forcedSales > 0)),
    boughtShare: bought.length / Math.max(1, games.length),
    firstPurchaseMonths: bought.length > 0 ? median(firstMonths) : null,
    firstPurchaseInWindowShare: share(
      games.map((game) => {
        const months = (game.firstPurchaseDay ?? Number.POSITIVE_INFINITY) / DAYS_PER_MONTH;
        return months >= 1 && months <= 6;
      }),
    ),
    bailleurYears: median(games.map((game) => yearsOrInfinity(game.bailleurDay))),
    bailleurShare: share(games.map((game) => game.bailleurDay !== null)),
    seasonedYears: median(games.map((game) => yearsOrInfinity(game.seasonedDay))),
    seasonedShare: share(games.map((game) => game.seasonedDay !== null)),
    netWorth: { p10: percentiles(0.1), p50: percentiles(0.5), p90: percentiles(0.9) },
    maxFinalNetWorth: Math.max(...games.map((game) => game.finalNetWorth)),
    medianProperties: median(games.map((game) => game.finalProperties)),
    medianMonthlyRent: median(games.map((game) => game.finalMonthlyRent)),
    medianDebtRatio: median(games.map((game) => game.finalDebtRatio)),
    medianVisits: median(games.map((game) => game.visits)),
    medianOffers: median(games.map((game) => game.offers)),
    meanLostToRivals: mean(games.map((game) => game.lostToRivals)),
    meanRivalOffers: mean(games.map((game) => game.rivalOffers)),
    rivalPurchasesPerYear: Object.fromEntries(
      Object.entries(rivalTotals).map(([id, total]) => [id, total / Math.max(1, games.length)]),
    ),
    byJob,
    renting: rentingSummary(games),
    rhythm: rhythmSummary(games),
    cities: citiesSummary(games),
    works: {
      projects: mean(games.map((g) => g.worksProjects)),
      cost: mean(games.map((g) => g.worksCost)),
      hazardsPerProject:
        games.reduce((sum, g) => sum + g.hazards, 0) /
        Math.max(
          1,
          games.reduce((sum, g) => sum + g.worksProjects, 0),
        ),
      dpeClassesGained: mean(games.map((g) => g.dpeClassesGained)),
      sales: mean(games.map((g) => g.sales)),
      passoireShare:
        games.reduce((sum, g) => sum + g.finalPassoires, 0) /
        Math.max(
          1,
          games.reduce((sum, g) => sum + g.finalProperties, 0),
        ),
    },
    depth: depthSummary(games),
  };
}

function depthSummary(games: GameMetrics[]): BotSummary['depth'] {
  const yearsOf = (days: (number | null)[]) => {
    const known = days.filter((day): day is number => day !== null);
    return known.length > 0 ? median(known.map((day) => day / DAYS_PER_YEAR)) : null;
  };
  const companies = games.filter((g) => g.companyDay !== null);
  return {
    companyShare: share(games.map((g) => g.companyDay !== null)),
    companyYears: yearsOf(games.map((g) => g.companyDay)),
    companyProperties:
      companies.length > 0 ? median(companies.map((g) => g.finalCompanyProperties)) : 0,
    transformations: mean(games.map((g) => g.transformations)),
    wealthTaxShare: share(games.map((g) => g.wealthTax > 0)),
    wealthTax: mean(games.map((g) => g.wealthTax)),
    horizonShare: share(games.map((g) => g.horizonDay !== null)),
    horizonYears: yearsOf(games.map((g) => g.horizonDay)),
  };
}

function citiesSummary(games: GameMetrics[]): BotSummary['cities'] {
  const gameYears = (game: GameMetrics) => Math.max(1, game.days / DAYS_PER_YEAR);
  const perYear = (pick: (game: GameMetrics) => number) =>
    mean(games.map((game) => pick(game) / gameYears(game)));
  const remote = games.filter((game) => game.firstRemotePurchaseDay !== null);
  const cityIds = Object.keys(gameContent.cities);
  return {
    remoteBuyerShare: remote.length / Math.max(1, games.length),
    firstRemoteMonths:
      remote.length > 0
        ? median(remote.map((game) => (game.firstRemotePurchaseDay ?? 0) / DAYS_PER_MONTH))
        : null,
    remotePurchases: mean(games.map((game) => game.remotePurchases)),
    tripsPerYear: perYear((game) => game.trips),
    tripHoursPerYear: perYear((game) => game.tripMinutes / 60),
    tripCostPerYear: perYear((game) => game.tripCost),
    remoteFeesPerYear: perYear((game) => game.remoteFees),
    twoCitiesShare: share(games.map((game) => game.finalCities >= 2)),
    medianCities: median(games.map((game) => game.finalCities)),
    medianRenown: Object.fromEntries(
      cityIds.map((cityId) => [cityId, median(games.map((game) => game.finalRenown[cityId] ?? 0))]),
    ),
    buyersTripHoursPerYear: mean(
      remote.map((game) => game.tripMinutes / 60 / Math.max(1, game.days / DAYS_PER_YEAR)),
    ),
    buyersNetWorth: remote.length > 0 ? median(remote.map((game) => game.finalNetWorth)) : null,
  };
}

function intervalOf(games: readonly GameMetrics[]): number {
  const decisions = games.reduce((sum, g) => sum + g.decisions, 0);
  const seconds = games.reduce((sum, g) => sum + g.realSeconds, 0);
  return decisions > 0 ? seconds / decisions : Number.POSITIVE_INFINITY;
}

function rhythmSummary(games: GameMetrics[]): BotSummary['rhythm'] {
  const years = games.reduce((sum, g) => sum + g.days / DAYS_PER_YEAR, 0) || 1;
  const perYear = (pick: (g: GameMetrics) => number) =>
    games.reduce((sum, g) => sum + pick(g), 0) / years;
  const intervalByJob: Record<string, number> = {};
  for (const job of jobs) {
    const ofJob = games.filter((game) => game.jobId === job.id);
    if (ofJob.length > 0) intervalByJob[job.id] = intervalOf(ofJob);
  }
  const titles: BotSummary['rhythm']['titles'] = {};
  for (const title of gameContent.titles) {
    if (title.step === 0 || !title.available) continue;
    const days = games
      .map((g) => g.titleDays[title.id])
      .filter((day): day is number => day !== undefined);
    titles[title.id] = {
      share: days.length / Math.max(1, games.length),
      years: days.length > 0 ? median(days) / DAYS_PER_YEAR : null,
      within10: days.filter((day) => day <= 10 * DAYS_PER_YEAR).length / Math.max(1, games.length),
    };
  }
  return {
    interval: intervalOf(games),
    intervalByJob,
    decisionsPerYear: perYear((g) => g.decisions),
    catalogPerYear: perYear((g) => g.catalogEvents),
    interestingPerYear: perYear((g) => g.interestingListings),
    challengesPerYear: perYear((g) => g.challengesOffered),
    challengesWonPerYear: perYear((g) => g.challengesWon),
    anecdotesPerYear: perYear((g) => g.anecdotes),
    calmShare: games.reduce((sum, g) => sum + g.calmDays, 0) / Math.max(1, years * DAYS_PER_YEAR),
    realHoursPerYear: perYear((g) => g.realSeconds) / 3600,
    medianAchievements: median(games.map((g) => g.achievements)),
    medianReputation: median(games.map((g) => g.finalReputation)),
    titles,
  };
}

function rentingSummary(games: GameMetrics[]): BotSummary['renting'] {
  const total = (pick: (game: GameMetrics) => number) =>
    games.reduce((sum, game) => sum + pick(game), 0);
  const propertyYears = Math.max(1, total((g) => g.ownedMonths) / 12);
  const gameYears = Math.max(
    1,
    total((g) => g.days / DAYS_PER_YEAR),
  );
  const assessed = Math.max(
    1,
    total((g) => g.assessedPropertyYears),
  );
  return {
    occupancy:
      total((g) => g.letMonths) /
      Math.max(
        1,
        total((g) => g.ownedMonths),
      ),
    rentMissed: total((g) => g.rentMissed) / propertyYears,
    incidents: total((g) => g.incidents) / propertyYears,
    departures: total((g) => g.tenantDepartures) / propertyYears,
    evictionShare: share(games.map((g) => g.evictions > 0)),
    rentTaxPerYear: total((g) => g.rentTax) / gameYears,
    propertyTaxPerYear: total((g) => g.propertyTax) / gameYears,
    accountantPerYear: total((g) => g.accountantFees) / gameYears,
    capitalGainsTax: mean(games.map((g) => g.capitalGainsTax)),
    realRegimeShare: total((g) => g.realRegimeYears) / assessed,
    furnishedShare: total((g) => g.furnishedYears) / assessed,
  };
}

const percentFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
});
const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const moneyFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const pct = (value: number) => percentFormat.format(value);
const num = (value: number) => (Number.isFinite(value) ? numberFormat.format(value) : '> 10');
const money = (value: number) => moneyFormat.format(value);

/**
 * The savings of a do-nothing player at the best saving rate of docs/03-systemes/01, with the
 * bonuses and windfalls of the « Vie perso » events (about 100 € a month on average).
 */
const INACTIVE_CEILING_MONTHLY_SAVINGS = 650;

/**
 * Milestone 7 (docs/09): « une expansion à Dijon est viable mais demande un vrai effort ».
 * Viable: the Chasseur who also buys in Dijon ends about as rich as the one who stays in Dole,
 * without more bankruptcies. Effort: it takes years to afford a first property there, and most
 * games never get to one. Besançon and Chalon-sur-Saône are shown for comparison.
 */
function cityChecks(get: (id: BotId) => BotSummary | undefined, last: number): TargetCheck[] {
  const list: TargetCheck[] = [];
  const hunter = get('chasseur');
  const dijon = get('chasseurDijon');
  if (hunter && dijon) {
    const ours = dijon.netWorth.p50[last] ?? 0;
    const base = hunter.netWorth.p50[last] ?? 0;
    list.push({
      label: 'Une expansion à Dijon est viable',
      target:
        'médiane à 10 ans du Chasseur à Dijon d’au moins 90 % de celle du Chasseur, et pas plus de 3 points de faillites en plus',
      measured: `${money(ours)} contre ${money(base)} (${pct(ours / Math.max(1, base))}) ; faillites ${pct(dijon.bankruptShare)} contre ${pct(hunter.bankruptShare)}`,
      ok: ours >= 0.9 * base && dijon.bankruptShare <= hunter.bankruptShare + 0.03,
    });
    const months = dijon.cities.firstRemoteMonths;
    list.push({
      label: 'Une expansion à Dijon demande un vrai effort',
      target:
        'premier achat à Dijon après plus de 24 mois (médiane), et moins de la moitié des parties y achètent en 10 ans',
      measured:
        months === null
          ? 'aucun achat à Dijon'
          : `${num(months)} mois ; ${pct(dijon.cities.remoteBuyerShare)} des parties y achètent ; ${num(dijon.cities.buyersTripHoursPerYear)} h de route par an pour celles-ci`,
      ok: months !== null && months > 24 && dijon.cities.remoteBuyerShare < 0.5,
    });
  }
  for (const id of ['chasseurBesancon', 'chasseurChalon'] as const) {
    const s = get(id);
    if (!s || !hunter) continue;
    list.push({
      label: `Expansion (${BOT_NAMES[id]})`,
      target: 'information : comparée au Chasseur',
      measured: `médiane ${money(s.netWorth.p50[last] ?? 0)} contre ${money(hunter.netWorth.p50[last] ?? 0)} ; ${pct(s.cities.remoteBuyerShare)} des parties y achètent (premier achat ${s.cities.firstRemoteMonths === null ? '—' : `${num(s.cities.firstRemoteMonths)} mois`}) ; faillites ${pct(s.bankruptShare)}`,
      ok: null,
    });
  }
  return list;
}

/**
 * The depth (milestone 8), over games of 20 years or more: Magnat in 10 to 25 % of the games
 * (15 to 25 years), Baron rare, the Promoteur title in most games of the Promoteur bot (10 to
 * 15 years; docs/08).
 */
function depthChecks(get: (id: BotId) => BotSummary | undefined, years: number): TargetCheck[] {
  const list: TargetCheck[] = [];
  const promoter = get('promoteur');
  if (promoter) {
    const title = promoter.rhythm.titles.developer;
    const share = title?.share ?? 0;
    const at = title?.years ?? null;
    list.push({
      label: 'Titre Promoteur (Promoteur)',
      target:
        years >= 20
          ? `plus de 50 % des parties en ${years} ans, de 10 à 15 ans en médiane`
          : `information (cible jugée sur 20 ans ou plus)`,
      measured: `${pct(share)} en ${years} ans (${num(at ?? 0)} ans en médiane) ; ${pct(title?.within10 ?? 0)} en 10 ans`,
      ok: years >= 20 ? share > 0.5 && at !== null && at >= 10 && at <= 15 : null,
    });
  }
  if (years < 20) return list;
  for (const id of ['chasseur', 'promoteur'] as const) {
    const s = get(id);
    if (!s) continue;
    const magnate = s.rhythm.titles.magnate;
    const share = magnate?.share ?? 0;
    const at = magnate?.years ?? null;
    list.push({
      label: `Titre Magnat (${BOT_NAMES[id]})`,
      target: `10 à 25 % des parties en ${years} ans, de 15 à 25 ans en médiane`,
      measured: `${pct(share)} des parties${at === null ? '' : `, en ${num(at)} ans (médiane)`}`,
      ok: share >= 0.1 && share <= 0.25 && at !== null && at >= 15 && at <= 25,
    });
    const baron = s.rhythm.titles.baron;
    list.push({
      label: `Titre Baron de la pierre (${BOT_NAMES[id]})`,
      target: `moins de 5 % des parties en ${years} ans`,
      measured: `${pct(baron?.share ?? 0)} des parties`,
      ok: (baron?.share ?? 0) < 0.05,
    });
  }
  return list;
}

function checks(summaries: Map<BotId, BotSummary>, years: number): TargetCheck[] {
  const list: TargetCheck[] = [];
  const get = (id: BotId) => summaries.get(id);
  const last = years - 1;
  list.push(...depthChecks(get, years));
  // Section 8.1 is for « un joueur raisonnable »: the hunter, who visits, negotiates and
  // keeps a moderate debt. The Prudent bot is shown for information.
  for (const id of ['chasseur', 'prudent'] as const) {
    const s = get(id);
    if (!s) continue;
    const graded = id === 'chasseur';
    const months = s.firstPurchaseMonths;
    list.push({
      label: `Premier achat (${BOT_NAMES[id]})`,
      target: 'entre le 2e et le 6e mois (médiane)',
      measured:
        months === null
          ? 'aucun achat'
          : `${num(months)} mois (${pct(s.firstPurchaseInWindowShare)} des parties dans la fenêtre, ${pct(s.boughtShare)} achètent)`,
      ok: graded ? months !== null && months >= 1 && months <= 6 : null,
    });
    list.push({
      label: `Titre Bailleur (${BOT_NAMES[id]})`,
      target: '2 à 4 ans',
      measured: `${num(s.bailleurYears)} ans (atteint dans ${pct(s.bailleurShare)} des parties)`,
      ok: graded ? s.bailleurYears >= 2 && s.bailleurYears <= 4 : null,
    });
    // The title asks for properties in two cities: only an expanding bot can earn it.
    list.push({
      label: `Titre Investisseur aguerri (${BOT_NAMES[id]})`,
      target: '6 à 10 ans (demande aussi 2 villes : jugé sur le Chasseur à Dijon)',
      measured: `${num(s.seasonedYears)} ans (atteint dans ${pct(s.seasonedShare)} des parties)`,
      ok: null,
    });
  }
  const dijonHunter = get('chasseurDijon');
  if (dijonHunter) {
    list.push({
      label: 'Titre Investisseur aguerri (Chasseur à Dijon)',
      target: '6 à 10 ans (patrimoine de 150 k€ et 2 villes)',
      measured: `${num(dijonHunter.seasonedYears)} ans (atteint dans ${pct(dijonHunter.seasonedShare)} des parties)`,
      ok: dijonHunter.seasonedYears >= 6 && dijonHunter.seasonedYears <= 10,
    });
  }
  // Docs/08, 8.1: one interesting decision every 30 to 60 real seconds at ×1, for every job.
  for (const id of ['chasseur', 'prudent'] as const) {
    const s = get(id);
    if (!s) continue;
    const intervals = Object.values(s.rhythm.intervalByJob);
    const low = Math.min(...intervals);
    const high = Math.max(...intervals);
    list.push({
      label: `Densité de décisions (${BOT_NAMES[id]})`,
      target: 'une décision toutes les 30 à 60 s réelles à ×1, pour chaque métier',
      measured: `${num(s.rhythm.interval)} s en moyenne (de ${num(low)} à ${num(high)} s selon le métier)`,
      ok: low >= 30 && high <= 60,
    });
  }
  // The expansion targets are set over 10 years (milestone 7).
  if (years <= 10) list.push(...cityChecks(get, last));
  const prudent = get('prudent');
  if (prudent) {
    list.push({
      label: 'Faillites du Prudent',
      target: 'moins de 5 %',
      measured: pct(prudent.bankruptShare),
      ok: prudent.bankruptShare < 0.05,
    });
  }
  const levier = get('levier');
  if (levier) {
    list.push({
      label: 'Faillites du Levier maximal',
      target: 'plus de 40 %',
      measured: pct(levier.bankruptShare),
      ok: levier.bankruptShare > 0.4,
    });
    if (prudent) {
      list.push({
        label: 'Le Levier maximal peut progresser vite',
        target: 'son 9e décile dépasse la médiane du Prudent',
        measured: `${money(levier.netWorth.p90[last] ?? 0)} contre ${money(prudent.netWorth.p50[last] ?? 0)}`,
        ok: (levier.netWorth.p90[last] ?? 0) > (prudent.netWorth.p50[last] ?? 0),
      });
    }
  }
  const inactive = get('inactif');
  const naive = get('naif');
  if (naive && inactive) {
    list.push({
      label: 'Le Naïf stagne ou perd',
      target: 'médiane à 10 ans ≤ celle de l’Inactif',
      measured: `${money(naive.netWorth.p50[last] ?? 0)} contre ${money(inactive.netWorth.p50[last] ?? 0)}`,
      ok: (naive.netWorth.p50[last] ?? 0) <= (inactive.netWorth.p50[last] ?? 0),
    });
  }
  if (inactive) {
    // Salary savings are random for the variable-pay jobs: compare each job's median.
    const ceiling = gameContent.start.savings + INACTIVE_CEILING_MONTHLY_SAVINGS * 12 * years;
    const highest = Math.max(...Object.values(inactive.byJob));
    list.push({
      label: 'L’Inactif ne s’enrichit jamais',
      target: `médiane de chaque métier ≤ apport + ${INACTIVE_CEILING_MONTHLY_SAVINGS} €/mois d’épargne (${money(ceiling)})`,
      measured: `métier le plus favorable ${money(highest)} (maximum d’une partie ${money(inactive.maxFinalNetWorth)})`,
      ok: highest <= ceiling,
    });
  }
  const hunter = get('chasseur');
  if (hunter && prudent) {
    list.push({
      label: 'Le Chasseur a un bon rendement',
      target: 'médiane à 10 ans au-dessus de celle du Prudent',
      measured: `${money(hunter.netWorth.p50[last] ?? 0)} contre ${money(prudent.netWorth.p50[last] ?? 0)}`,
      ok: (hunter.netWorth.p50[last] ?? 0) > (prudent.netWorth.p50[last] ?? 0),
    });
    list.push({
      label: 'Le Chasseur est limité par le temps libre',
      target: 'information : visites médianes, patrimoine selon le métier',
      measured: `${num(hunter.medianVisits)} visites ; ${Object.entries(hunter.byJob)
        .map(([job, value]) => `${job} ${money(value)}`)
        .join(', ')}`,
      ok: null,
    });
  }
  const dealer = get('marchand');
  if (dealer && inactive) {
    list.push({
      label: 'Le Marchand de biens fait des plus-values',
      target: 'médiane à 10 ans au-dessus de celle de l’Inactif ; information : reventes',
      measured: `${money(dealer.netWorth.p50[last] ?? 0)} contre ${money(inactive.netWorth.p50[last] ?? 0)} ; ${num(dealer.works.sales)} reventes par partie, ${money(dealer.renting.capitalGainsTax)} d’impôt sur les plus-values`,
      ok: (dealer.netWorth.p50[last] ?? 0) > (inactive.netWorth.p50[last] ?? 0),
    });
  }
  const premium = get('renovateur');
  if (premium) {
    const others = (['prudent', 'levier', 'chasseur', 'marchand'] as const)
      .map((id) => get(id))
      .filter((s): s is BotSummary => s !== undefined);
    const bestOther = others.sort(
      (a, b) => (b.netWorth.p50[last] ?? 0) - (a.netWorth.p50[last] ?? 0),
    )[0];
    if (bestOther) {
      const ours = premium.netWorth.p50[last] ?? 0;
      const theirs = bestOther.netWorth.p50[last] ?? 0;
      list.push({
        label: 'Le Rénovateur premium n’écrase pas les autres',
        target: 'médiane à 10 ans sous 1,1 × la meilleure médiane des autres investisseurs',
        measured: `${money(ours)} contre ${money(theirs)} (${BOT_NAMES[bestOther.botId]})`,
        ok: ours < 1.1 * theirs,
      });
    }
  }
  const best = [...summaries.values()].sort(
    (a, b) => (b.netWorth.p50[last] ?? 0) - (a.netWorth.p50[last] ?? 0),
  )[0];
  if (best) {
    list.push({
      label: 'Aucune stratégie ne domine',
      target: 'information (une seule ville et un seul mode au jalon 1)',
      measured: `meilleure médiane : ${BOT_NAMES[best.botId]} (${money(best.netWorth.p50[last] ?? 0)})`,
      ok: null,
    });
  }
  return list;
}

export function buildReport(results: GameMetrics[], years: number): Report {
  const summaries = new Map<BotId, BotSummary>();
  for (const botId of BOT_IDS) {
    const games = results.filter((game) => game.botId === botId);
    if (games.length > 0) summaries.set(botId, summarize(botId, games, years));
  }
  const games = Math.max(0, ...[...summaries.values()].map((s) => s.games));
  return { games, years, summaries: [...summaries.values()], checks: checks(summaries, years) };
}

function table(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/** « 1000 parties », or « de 300 à 1000 parties » when the bots did not play as many. */
function gamesLabel(summaries: readonly BotSummary[]): string {
  const counts = summaries.map((s) => s.games);
  const low = Math.min(...counts);
  const high = Math.max(...counts);
  return low === high ? `${high} parties` : `De ${low} à ${high} parties`;
}

export function formatReport(report: Report, title: string): string {
  const { summaries, years } = report;
  const last = years - 1;
  const name = (s: BotSummary) => BOT_NAMES[s.botId];
  const failed = report.checks.filter((check) => check.ok === false).length;
  // Rivals present from the start, and those that arrived in at least one game (SCI Horizon).
  const rivalsShown = gameContent.rivals.filter(
    (r) => r.active || summaries.some((s) => (s.rivalPurchasesPerYear[r.id] ?? 0) > 0),
  );
  const lines = [
    `# ${title}`,
    '',
    `${gamesLabel(summaries)} de ${years} ans par bot, mêmes graines et mêmes métiers pour chaque bot (les 7 métiers à tour de rôle sauf mention contraire). Les repères de la section 8.1 (« joueur raisonnable ») sont jugés sur le Chasseur ; ceux du Prudent sont donnés pour information.`,
    '',
    '## Cibles',
    '',
    failed === 0
      ? 'Toutes les cibles mesurées sont atteintes.'
      : `**${failed} cible(s) manquée(s).**`,
    '',
    table(
      ['', 'Repère', 'Cible', 'Mesure'],
      report.checks.map((check) => [
        check.ok === null ? 'ℹ️' : check.ok ? '✅' : '❌',
        check.label,
        check.target,
        check.measured,
      ]),
    ),
    '',
    '## Patrimoine net (€)',
    '',
    table(
      [
        'Bot',
        'An 1',
        'An 2',
        'An 5',
        `An ${years} (D1)`,
        `An ${years} (médiane)`,
        `An ${years} (D9)`,
      ],
      summaries.map((s) => [
        name(s),
        money(s.netWorth.p50[0] ?? 0),
        money(s.netWorth.p50[1] ?? 0),
        money(s.netWorth.p50[4] ?? 0),
        money(s.netWorth.p10[last] ?? 0),
        money(s.netWorth.p50[last] ?? 0),
        money(s.netWorth.p90[last] ?? 0),
      ]),
    ),
    '',
    '## Activité',
    '',
    table(
      [
        'Bot',
        'Faillites',
        'Ventes forcées',
        'Biens (médiane)',
        'Loyers/mois',
        'Endettement',
        'Visites',
        'Offres',
        'Annonces perdues face aux rivaux',
        'Offres de rivaux reçues',
      ],
      summaries.map((s) => [
        name(s),
        pct(s.bankruptShare),
        pct(s.forcedSaleShare),
        num(s.medianProperties),
        money(s.medianMonthlyRent),
        pct(s.medianDebtRatio),
        num(s.medianVisits),
        num(s.medianOffers),
        num(s.meanLostToRivals),
        num(s.meanRivalOffers),
      ]),
    ),
    '',
    '## Location et fiscalité',
    '',
    'Moyennes sur toutes les parties : taux d’occupation des biens loués, événements par bien et par an, impôts par partie et par an.',
    '',
    table(
      [
        'Bot',
        'Occupation',
        'Loyers impayés',
        'Incidents',
        'Départs',
        'Parties avec expulsion',
        'Impôt sur les loyers/an',
        'Taxe foncière/an',
        'Comptable/an',
        'Impôt sur les plus-values (partie)',
        'Biens au réel',
        'Biens meublés',
      ],
      summaries.map((s) => [
        name(s),
        pct(s.renting.occupancy),
        num(s.renting.rentMissed),
        num(s.renting.incidents),
        num(s.renting.departures),
        pct(s.renting.evictionShare),
        money(s.renting.rentTaxPerYear),
        money(s.renting.propertyTaxPerYear),
        money(s.renting.accountantPerYear),
        money(s.renting.capitalGainsTax),
        pct(s.renting.realRegimeShare),
        pct(s.renting.furnishedShare),
      ]),
    ),
    '',
    '## Villes',
    '',
    'Moyennes par partie et par an de jeu : trajets, heures de route, frais de déplacement et de gestion à distance ; achats hors de la ville de base ; part des parties qui finissent avec des biens dans au moins deux villes ; notoriété locale finale (médiane).',
    '',
    table(
      [
        'Bot',
        'Achètent hors de la base',
        '1er achat éloigné (mois)',
        'Achats éloignés/partie',
        'Trajets/an',
        'Heures de route/an',
        'Déplacements/an',
        'Gestion à distance/an',
        'Biens dans 2 villes ou plus',
        ...Object.keys(gameContent.cities).map(
          (cityId) => `Notoriété ${gameContent.cities[cityId]?.name ?? cityId}`,
        ),
      ],
      summaries.map((s) => [
        name(s),
        pct(s.cities.remoteBuyerShare),
        s.cities.firstRemoteMonths === null ? '—' : num(s.cities.firstRemoteMonths),
        num(s.cities.remotePurchases),
        num(s.cities.tripsPerYear),
        num(s.cities.tripHoursPerYear),
        money(s.cities.tripCostPerYear),
        money(s.cities.remoteFeesPerYear),
        pct(s.cities.twoCitiesShare),
        ...Object.keys(gameContent.cities).map((cityId) => num(s.cities.medianRenown[cityId] ?? 0)),
      ]),
    ),
    '',
    '## Travaux',
    '',
    'Moyennes par partie : chantiers terminés, leur coût, imprévus par chantier, classes DPE gagnées, reventes ; part des biens détenus à la fin classés E, F ou G.',
    '',
    table(
      [
        'Bot',
        'Chantiers',
        'Coût des travaux',
        'Imprévus/chantier',
        'Classes DPE gagnées',
        'Reventes',
        'Passoires à la fin',
      ],
      summaries.map((s) => [
        name(s),
        num(s.works.projects),
        money(s.works.cost),
        num(s.works.hazardsPerProject),
        num(s.works.dpeClassesGained),
        num(s.works.sales),
        pct(s.works.passoireShare),
      ]),
    ),
    '',
    '## Profondeur',
    '',
    'SCI : part des parties qui la créent, années (médiane), biens qu’elle détient à la fin (médiane, sur ces parties) ; transformations par partie ; IFI : part des parties qui le paient au moins une fois, montant moyen par partie ; arrivée de la SCI Horizon Patrimoine.',
    '',
    table(
      [
        'Bot',
        'SCI créée',
        'Biens de la SCI',
        'Transformations',
        'IFI payé',
        'IFI (partie)',
        'Arrivée d’Horizon',
      ],
      summaries.map((s) => [
        name(s),
        s.depth.companyYears === null
          ? '—'
          : `${pct(s.depth.companyShare)} · ${num(s.depth.companyYears)} ans`,
        num(s.depth.companyProperties),
        num(s.depth.transformations),
        pct(s.depth.wealthTaxShare),
        money(s.depth.wealthTax),
        s.depth.horizonYears === null
          ? '—'
          : `${pct(s.depth.horizonShare)} · ${num(s.depth.horizonYears)} ans`,
      ]),
    ),
    '',
    '## Rythme et progression',
    '',
    `Densité de décisions : nouvelles entrées de la boîte de décisions (événements à choix et défis compris) et annonces au moins 5 % sous l’estimation que le bot pourrait financer, rapportées au temps réel d’une partie jouée à ×1 avec l’accélération automatique (×${gameContent.rhythm.autoSpeed.speed} quand rien d’urgent n’attend, ×1 pendant quelques heures après chaque nouvelle décision). Moyennes par an de jeu ; titres : part des parties qui l’obtiennent et médiane des années (sur ces parties).`,
    '',
    table(
      [
        'Bot',
        'Secondes par décision',
        'Décisions/an',
        'Événements/an',
        'Annonces intéressantes/an',
        'Défis proposés/an (réussis)',
        'Anecdotes/an',
        'Temps accéléré',
        'Heures réelles/an',
        'Succès (médiane)',
        'Réputation finale (médiane)',
      ],
      summaries.map((s) => [
        name(s),
        num(s.rhythm.interval),
        num(s.rhythm.decisionsPerYear),
        num(s.rhythm.catalogPerYear),
        num(s.rhythm.interestingPerYear),
        `${num(s.rhythm.challengesPerYear)} (${num(s.rhythm.challengesWonPerYear)})`,
        num(s.rhythm.anecdotesPerYear),
        pct(s.rhythm.calmShare),
        num(s.rhythm.realHoursPerYear),
        num(s.rhythm.medianAchievements),
        num(s.rhythm.medianReputation),
      ]),
    ),
    '',
    table(
      ['Bot', ...jobs.map((job) => `${job.name} (s/décision)`)],
      summaries.map((s) => [
        name(s),
        ...jobs.map((job) => num(s.rhythm.intervalByJob[job.id] ?? Number.NaN)),
      ]),
    ),
    '',
    table(
      ['Bot', ...gameContent.titles.filter((t) => t.step > 0 && t.available).map((t) => t.name)],
      summaries.map((s) => [
        name(s),
        ...gameContent.titles
          .filter((t) => t.step > 0 && t.available)
          .map((t) => {
            const title = s.rhythm.titles[t.id];
            if (!title || title.share === 0) return '—';
            return `${pct(title.share)} · ${num(title.years ?? 0)} ans`;
          }),
      ]),
    ),
    '',
    '## Patrimoine net à la fin selon le métier (médiane, €)',
    '',
    table(
      ['Bot', ...jobs.map((job) => job.name)],
      summaries.map((s) => [name(s), ...jobs.map((job) => money(s.byJob[job.id] ?? Number.NaN))]),
    ),
    '',
    '## Rivaux',
    '',
    table(
      ['Bot', ...rivalsShown.map((r) => `${r.name} (achats/an)`)],
      summaries.map((s) => [
        name(s),
        ...rivalsShown.map((r) => num(s.rivalPurchasesPerYear[r.id] ?? 0)),
      ]),
    ),
    '',
  ];
  return lines.join('\n');
}
