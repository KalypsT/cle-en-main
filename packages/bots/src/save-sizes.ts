import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { gameContent, timeSettings } from '@cle/content';
import { type GameEvent, type GameState, serializeGame, toIsoDate } from '@cle/engine';
import { playGame } from './driver.ts';
import { BOT_IDS, type BotId, createStrategy } from './strategies.ts';

/**
 * Measures what a long game weighs in the game's saves (docs/07-architecture.md, 7.5): the
 * serialized state, a rewind point and the game log, as the interface writes them. Used to size
 * the saves kept on the DomoThib server (2 MiB per value, 20 MiB per player).
 */

const USAGE = `Usage : pnpm --filter @cle/bots save-sizes [--bot <bot>] [--seed <entier>] [--years <entier>]

  --bot    stratégie jouée (${BOT_IDS.join(', ')}), défaut promoteur
  --seed   graine (défaut 1)
  --years  durée de la partie en années (défaut 25)`;

/** Same as UNLOGGED in apps/game/src/App.tsx: events too frequent for the game log. */
const UNLOGGED: ReadonlySet<GameEvent['type']> = new Set([
  'dayStarted',
  'weekendStarted',
  'propertyPricesUpdated',
  'marketRateChanged',
]);

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    bot: { type: 'string', default: 'promoteur' },
    seed: { type: 'string', default: '1' },
    years: { type: 'string', default: '25' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
const bot = values.bot as BotId;
if (!BOT_IDS.includes(bot)) {
  console.error(`Bot inconnu : ${values.bot}.\n\n${USAGE}`);
  process.exit(1);
}
const seed = Number(values.seed);
const years = Number(values.years);

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
const kib = (n: number) => `${(n / 1024).toFixed(0)} Kio`;

/** Lengths in bytes of each log line (JSON of the entry, as the interface keeps it). */
const lines: number[] = [];
let lastLines: string[] = [];
const keep = gameContent.rhythm.journalEntries;
const log = (state: GameState, kind: 'event' | 'action', data: unknown) => {
  const line = JSON.stringify({
    hour: state.clock.elapsedHours,
    date: toIsoDate(state.clock.date),
    kind,
    data,
  });
  lines.push(bytes(line));
  lastLines.push(line);
  if (lastLines.length > 2 * keep) lastLines = lastLines.slice(-keep);
};

let maxState = 0;
let maxStateDate = '';
let last: GameState | null = null;
let months = 0;
const startedAt = performance.now();
playGame(createStrategy(bot), {
  seed,
  startDate: { year: 2027, month: 1, day: 1 },
  startHour: timeSettings.startHour,
  days: Math.round(years * 365.25),
  jobId: gameContent.start.defaultJobId,
  observer: {
    events(events, state) {
      last = state;
      for (const event of events) if (!UNLOGGED.has(event.type)) log(state, 'event', event);
      if (events.some((event) => event.type === 'monthStarted')) {
        months += 1;
        const size = bytes(serializeGame(state));
        if (size > maxState) {
          maxState = size;
          maxStateDate = toIsoDate(state.clock.date);
        }
      }
    },
    action(action, state) {
      log(state, 'action', action);
    },
  },
});
if (!last) throw new Error('No state observed');
const final: GameState = last;
const finalJson = serializeGame(final);
const journal = lastLines.slice(-keep).join('\n');
const sorted = [...lines].sort((a, b) => a - b);
/** Stored on the DomoThib server: gzipped, then in Base64 (apps/game/src/storage/domothib-storage.ts). */
const stored = (text: string) => Math.ceil(gzipSync(text).length / 3) * 4;
const CHUNK_LINES = 2000;
const kept = lastLines.slice(-keep);
let journalStored = 0;
for (let start = 0; start < kept.length; start += CHUNK_LINES) {
  journalStored += stored(kept.slice(start, start + CHUNK_LINES).join('\n'));
}
const stateStored = stored(finalJson);
const points = gameContent.rhythm.rewindPoints;

console.log(
  [
    `Bot ${bot}, graine ${seed}, ${years} ans (arrêt le ${toIsoDate(final.clock.date)}, ${months} mois)`,
    `État sérialisé final : ${kib(bytes(finalJson))} (gzip ${kib(gzipSync(finalJson).length)})`,
    `État le plus lourd   : ${kib(maxState)} le ${maxStateDate}`,
    `Journal              : ${lines.length} lignes en tout, moyenne ${(
      lines.reduce((a, b) => a + b, 0) / Math.max(1, lines.length)
    ).toFixed(0)} o, médiane ${sorted[Math.floor(sorted.length / 2)] ?? 0} o, max ${
      sorted.at(-1) ?? 0
    } o`,
    `Journal gardé        : ${Math.min(keep, lines.length)} lignes, ${kib(bytes(journal))} (gzip ${kib(
      gzipSync(journal).length,
    )})`,
    `Sur DomoThib         : partie ${kib(stateStored)}, journal ${kib(journalStored)} en ${Math.ceil(
      kept.length / CHUNK_LINES,
    )} clés, emplacement complet (partie + ${points} points + journal) ${kib(
      stateStored * (1 + points) + journalStored,
    )}`,
    `Durée                : ${((performance.now() - startedAt) / 1000).toFixed(1)} s`,
  ].join('\n'),
);
