import { parseArgs } from 'node:util';
import { timeSettings } from '@cle/content';
import { describeTime, parseIsoDate, toIsoDate } from '@cle/engine';
import { engine, simulate } from './simulate.ts';

const USAGE = `Usage : pnpm bots [--seed <entier>] [--days <entier>] [--start <AAAA-MM-JJ>]

  --seed   graine du hasard (entier 32 bits, défaut 1)
  --days   nombre de jours simulés (défaut 3650, soit environ 10 ans)
  --start  date de début de la partie (défaut 2027-01-01)
  --job    métier du personnage (défaut : celui de content/partie.json)`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function parseInteger(name: string, value: string): number {
  if (!/^\d+$/.test(value)) fail(`--${name} doit être un entier positif.`);
  return Number(value);
}

const { values } = parseArgs({
  // pnpm forwards a literal `--` separator; ignore it.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    seed: { type: 'string', default: '1' },
    days: { type: 'string', default: '3650' },
    start: { type: 'string', default: '2027-01-01' },
    job: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const seed = parseInteger('seed', values.seed);
const days = parseInteger('days', values.days);
const startDate = parseIsoDate(values.start) ?? fail('--start doit être une date AAAA-MM-JJ.');

const startedAt = performance.now();
const result = simulate({
  seed,
  startDate,
  startHour: timeSettings.startHour,
  days,
  ...(values.job ? { jobId: values.job } : {}),
});
const elapsedMs = performance.now() - startedAt;

const years = days / 365.25;
const euros = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
console.log(
  [
    `Graine            : ${seed}`,
    `Début             : ${toIsoDate(startDate)}`,
    `Date atteinte     : ${describeTime(result.state)}`,
    `Jours simulés     : ${days} (≈ ${years.toFixed(1)} ans, ${result.ticks} pas d'une heure)`,
    `Métier            : ${result.state.player.jobId}`,
    `Patrimoine net    : ${euros(engine.netWorth(result.state))} (compte ${euros(result.state.player.balance)})`,
    `Taux de marché    : ${result.state.market.ratePercent.toFixed(2)} %`,
    `Indices des prix  : ${Object.entries(result.state.market.cities)
      .flatMap(([cityId, neighbourhoods]) =>
        Object.entries(neighbourhoods).map(
          ([id, market]) => `${cityId}/${id} ${market.priceIndex.toFixed(3)}`,
        ),
      )
      .join(', ')}`,
    `Annonces en ligne : ${result.state.listings.length}`,
    `Événements        : ${Object.entries(result.eventCounts)
      .map(([type, count]) => `${type} ${count}`)
      .join(', ')}`,
    `Durée de calcul   : ${elapsedMs.toFixed(0)} ms (${(years / (elapsedMs / 1000)).toFixed(0)} ans de jeu par seconde)`,
  ].join('\n'),
);
