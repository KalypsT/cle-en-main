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

/** The savings of a do-nothing player at the best saving rate of docs/03-systemes/01. */
const INACTIVE_CEILING_MONTHLY_SAVINGS = 250;

function checks(summaries: Map<BotId, BotSummary>, years: number): TargetCheck[] {
  const list: TargetCheck[] = [];
  const get = (id: BotId) => summaries.get(id);
  const last = years - 1;
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
      label: `Titre Bailleur, 3 biens loués (${BOT_NAMES[id]})`,
      target: '2 à 4 ans',
      measured: `${num(s.bailleurYears)} ans (atteint dans ${pct(s.bailleurShare)} des parties)`,
      ok: graded ? s.bailleurYears >= 2 && s.bailleurYears <= 4 : null,
    });
    list.push({
      label: `Investisseur aguerri, 250 k€ nets (${BOT_NAMES[id]})`,
      target: '6 à 10 ans (sans la condition des 2 villes)',
      measured: `${num(s.seasonedYears)} ans (atteint dans ${pct(s.seasonedShare)} des parties)`,
      ok: graded ? s.seasonedYears >= 6 && s.seasonedYears <= 10 : null,
    });
  }
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

export function formatReport(report: Report, title: string): string {
  const { summaries, years } = report;
  const last = years - 1;
  const name = (s: BotSummary) => BOT_NAMES[s.botId];
  const failed = report.checks.filter((check) => check.ok === false).length;
  const lines = [
    `# ${title}`,
    '',
    `${report.games} parties de ${years} ans par bot, mêmes graines et mêmes métiers pour chaque bot (les 7 métiers à tour de rôle sauf mention contraire). Les repères de la section 8.1 (« joueur raisonnable ») sont jugés sur le Chasseur ; ceux du Prudent sont donnés pour information.`,
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
      ['Bot', ...gameContent.rivals.filter((r) => r.active).map((r) => `${r.name} (achats/an)`)],
      summaries.map((s) => [
        name(s),
        ...gameContent.rivals
          .filter((r) => r.active)
          .map((r) => num(s.rivalPurchasesPerYear[r.id] ?? 0)),
      ]),
    ),
    '',
  ];
  return lines.join('\n');
}
