import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { jobs, timeSettings } from '@cle/content';
import { parseIsoDate } from '@cle/engine';
import type { GameMetrics } from './metrics.ts';
import { buildReport, formatReport } from './report.ts';
import { defaultWorkers, runTasks, seriesTasks } from './series.ts';
import { BOT_IDS, type BotId } from './strategies.ts';

const USAGE = `Usage : pnpm bots:series [--games <n>] [--years <n>] [--bots a,b] [--out <fichier.md>]

  --games    parties par bot (défaut 1000)
  --years    durée de chaque partie en années (défaut 10)
  --bots     bots à faire jouer, séparés par des virgules (défaut : ${BOT_IDS.join(',')})
  --seed     première graine (défaut 1) ; la partie i utilise la graine seed + i
  --job      métier fixe (défaut : les ${jobs.length} métiers à tour de rôle)
  --start    date de début (défaut 2027-01-01)
  --workers  fils de calcul (défaut : nombre de cœurs)
  --out      écrit le rapport Markdown (et le JSON à côté)
  --raw      écrit aussi les mesures de chaque partie (JSON), pour fusionner des séries
  --from     ne simule rien : fusionne des fichiers --raw (séparés par des virgules)
  --check    code de sortie 1 si une cible est manquée`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function positive(name: string, value: string): number {
  if (!/^\d+$/.test(value) || Number(value) === 0) fail(`--${name} doit être un entier positif.`);
  return Number(value);
}

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    games: { type: 'string', default: '1000' },
    years: { type: 'string', default: '10' },
    bots: { type: 'string', default: BOT_IDS.join(',') },
    seed: { type: 'string', default: '1' },
    job: { type: 'string' },
    start: { type: 'string', default: '2027-01-01' },
    workers: { type: 'string' },
    out: { type: 'string' },
    raw: { type: 'string' },
    from: { type: 'string' },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const bots = values.bots.split(',').map((id) => id.trim()) as BotId[];
for (const id of bots) if (!BOT_IDS.includes(id)) fail(`Bot inconnu : ${id}.`);
if (values.job && !jobs.some((job) => job.id === values.job))
  fail(`Métier inconnu : ${values.job}.`);
const years = positive('years', values.years);
const options = {
  bots,
  games: positive('games', values.games),
  years,
  firstSeed: Number(values.seed),
  startDate: parseIsoDate(values.start) ?? fail('--start doit être une date AAAA-MM-JJ.'),
  startHour: timeSettings.startHour,
  jobId: values.job ?? null,
  workers: values.workers ? positive('workers', values.workers) : defaultWorkers(),
};

const here = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
let results: GameMetrics[];
let footer: string;
if (values.from) {
  // Series run in several parts (one bot at a time), merged into one report.
  results = values.from
    .split(',')
    .flatMap((path) => JSON.parse(readFileSync(here(path.trim()), 'utf8')) as GameMetrics[]);
  footer = `Calcul : ${results.length} parties, fusionnées depuis ${values.from.split(',').length} série(s).`;
} else {
  const tasks = seriesTasks(options);
  const startedAt = performance.now();
  let lastShown = 0;
  results = await runTasks(tasks, options.workers, (done, total) => {
    const now = performance.now();
    if (process.stderr.isTTY && (now - lastShown > 1000 || done === total)) {
      lastShown = now;
      process.stderr.write(`\r${done} / ${total} parties`);
    }
  });
  if (process.stderr.isTTY) process.stderr.write('\n');
  const elapsed = (performance.now() - startedAt) / 1000;
  footer = `Calcul : ${tasks.length} parties en ${elapsed.toFixed(0)} s sur ${options.workers} fil(s).`;
}
if (values.raw) {
  const raw = here(values.raw);
  mkdirSync(dirname(raw), { recursive: true });
  writeFileSync(raw, JSON.stringify(results));
}

const report = buildReport(results, years);
const markdown = `${formatReport(report, 'Rapport d’équilibrage')}\n${footer}\n`;
console.log(markdown);
if (values.out) {
  const out = here(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, markdown);
  writeFileSync(out.replace(/\.md$/, '') + '.json', `${JSON.stringify(report, null, 2)}\n`);
}
if (values.check && report.checks.some((check) => check.ok === false)) process.exit(1);
