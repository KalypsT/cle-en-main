import { type CalendarDate, parseIsoDate, toIsoDate } from '@cle/engine';
import type { DomoThibSaves } from '../domothib/domothib-games.ts';
import { canCompress, gunzipFromBase64, gzipToBase64, utf8Bytes } from './compression.ts';
import {
  type Checkpoint,
  createQueue,
  dateKey,
  type JournalEntry,
  type SaveLimits,
  type SaveStorage,
  SLOT_IDS,
  type SlotId,
  type SlotSummary,
  type WriteOptions,
} from './save-storage.ts';

const KIB = 1024;
const MIB = 1024 * KIB;

/** What the DomoThib server accepts per game and per player (docs/domothib.md, §4.2). */
export const DOMOTHIB_LIMITS = { valueBytes: 2 * MIB, entries: 200, totalBytes: 20 * MIB };

/**
 * How the saves share the server's room (docs/07-architecture.md, 7.5). Measured on 25-year
 * bot games: a gzipped game is at most 0.22 MiB in Base64, and 20 000 log lines 0.3 MiB.
 */
export interface DomoThibBudget {
  /** Bytes one slot may take: its game, its rewind points and its log. */
  slotBytes: number;
  /** Lines of the log in one key. */
  journalChunkLines: number;
  /** Bytes of the log in one key, before compression. */
  journalChunkBytes: number;
}

export const DOMOTHIB_BUDGET: DomoThibBudget = {
  // Three slots take 18 MiB at most: 2 MiB of the 20 are left for the writes in flight.
  slotBytes: 6 * MIB,
  journalChunkLines: 2000,
  // Gzipped and in Base64, a chunk stays far below the 2 MiB of a value.
  journalChunkBytes: 1 * MIB,
};

/** Version of the values written here (first line of each value). */
const VALUE_FORMAT = 1;

type Encoding = 'gzip' | 'plain';

interface Header {
  format: number;
  encoding: Encoding;
}

interface SlotHeader extends Header, Omit<SlotSummary, 'slot'> {}
interface CheckpointHeader extends Header, Checkpoint {}

const slotKey = (slot: SlotId) => `slot-${slot}`;
const checkpointKey = (slot: SlotId, date: CalendarDate) => `checkpoint-${slot}-${toIsoDate(date)}`;
const journalKey = (slot: SlotId, index: number) => `journal-${slot}-${index}`;

const CHECKPOINT_KEY = /^checkpoint-(\d+)-(\d{4}-\d{2}-\d{2})$/;
const JOURNAL_KEY = /^journal-(\d+)-(\d+)$/;

/** The rewind points of a slot among the keys, oldest first. */
function checkpointKeys(
  keys: Iterable<string>,
  slot: SlotId,
): { key: string; date: CalendarDate }[] {
  const found: { key: string; date: CalendarDate }[] = [];
  for (const key of keys) {
    const match = CHECKPOINT_KEY.exec(key);
    const date = match && Number(match[1]) === slot ? parseIsoDate(match[2] ?? '') : null;
    if (date) found.push({ key, date });
  }
  return found.sort((a, b) => dateKey(a.date) - dateKey(b.date));
}

/** The log chunks of a slot among the keys, oldest first. */
function journalKeys(keys: Iterable<string>, slot: SlotId): { key: string; index: number }[] {
  const found: { key: string; index: number }[] = [];
  for (const key of keys) {
    const match = JOURNAL_KEY.exec(key);
    if (match && Number(match[1]) === slot) found.push({ key, index: Number(match[2]) });
  }
  return found.sort((a, b) => a.index - b.index);
}

/** All the keys of a slot: its game, its rewind points and its log. */
function slotKeys(keys: Iterable<string>, slot: SlotId): string[] {
  const all = [...keys];
  return [
    ...all.filter((key) => key === slotKey(slot)),
    ...checkpointKeys(all, slot).map(({ key }) => key),
    ...journalKeys(all, slot).map(({ key }) => key),
  ];
}

/** Splits a value into its header (first line, plain JSON) and its payload. */
function parseValue<T extends Header>(value: string): { header: T; payload: string } {
  const end = value.indexOf('\n');
  if (end < 0) throw new Error('Invalid save value');
  const header = JSON.parse(value.slice(0, end)) as T;
  if (header.format !== VALUE_FORMAT) throw new Error('Unknown save value format');
  return { header, payload: value.slice(end + 1) };
}

/** The log chunk being written: its lines are kept here and the whole chunk is sent again. */
interface OpenChunk {
  index: number;
  lines: string[];
  bytes: number;
}

/** Writes and removals decided by a task, sent once the task is over. */
interface Changes {
  writes: Map<string, string>;
  removals: Set<string>;
}

/**
 * The games on the DomoThib server (docs/domothib.md, §4.2), one value per key:
 *
 * - `slot-<n>`: the game of slot n;
 * - `checkpoint-<n>-<YYYY-MM-DD>`: a rewind point of slot n (the last `rewindPoints`);
 * - `journal-<n>-<k>`: the k-th chunk of slot n's log (`journalChunkLines` lines each,
 *   the chunks holding the last `journalEntries` lines).
 *
 * Each value is a header line in plain JSON (dates, net worth: what the screens list), then
 * the payload, gzipped and in Base64. The keys are listed once at the start: DomoThib then
 * knows their revisions, and the writes never conflict with saves it has not seen.
 */
export class DomoThibSaveStorage implements SaveStorage {
  private readonly saves: DomoThibSaves;
  private readonly limits: SaveLimits;
  private readonly budget: DomoThibBudget;
  private readonly compress: boolean;
  /** Keys on the server and the size of their value; listed once, then kept up to date. */
  private index: Promise<Map<string, number>> | null = null;
  private readonly summaries = new Map<SlotId, SlotSummary>();
  private readonly checkpoints = new Map<string, Checkpoint>();
  private readonly chunks = new Map<SlotId, OpenChunk>();
  /** The tasks of a slot run one after the other (bookkeeping and compression only). */
  private readonly queued = createQueue<SlotId>();

  constructor(
    saves: DomoThibSaves,
    limits: SaveLimits,
    options: { budget?: DomoThibBudget; compress?: boolean } = {},
  ) {
    this.saves = saves;
    this.limits = limits;
    this.budget = options.budget ?? DOMOTHIB_BUDGET;
    this.compress = options.compress ?? canCompress();
  }

  /** Lists the keys of the player (at launch, before reading the slots). */
  async open(): Promise<void> {
    await this.keys();
  }

  /** The keys, listed once; listed again after a failure (server out of reach). */
  private keys(): Promise<Map<string, number>> {
    this.index ??= this.saves.list().then(
      (entries) => new Map(entries.map((entry) => [entry.key, entry.size])),
      (error: unknown) => {
        this.index = null;
        throw error;
      },
    );
    return this.index;
  }

  private async encode(payload: string): Promise<{ encoding: Encoding; data: string }> {
    return this.compress
      ? { encoding: 'gzip', data: await gzipToBase64(payload) }
      : { encoding: 'plain', data: payload };
  }

  private async decode(header: Header, payload: string): Promise<string> {
    return header.encoding === 'gzip' ? gunzipFromBase64(payload) : payload;
  }

  /** Reads a value; a key gone meanwhile leaves the index. */
  private async read(key: string): Promise<string | null> {
    const keys = await this.keys();
    if (!keys.has(key)) return null;
    const value = await this.saves.read(key);
    if (value === null) keys.delete(key);
    return value;
  }

  /**
   * Runs a task of a slot, then sends its changes: removals first, then writes. The queue
   * only waits for the task, not for the server (DomoThib keeps the last value of each key).
   */
  private async change(
    slot: SlotId,
    task: (keys: Map<string, number>, changes: Changes) => Promise<void>,
  ): Promise<void> {
    const sent = await this.queued(slot, async () => {
      const keys = await this.keys();
      const changes: Changes = { writes: new Map(), removals: new Set() };
      await task(keys, changes);
      for (const [key, value] of changes.writes) {
        changes.removals.delete(key);
        keys.set(key, utf8Bytes(value));
      }
      for (const key of changes.removals) keys.delete(key);
      this.trim(slot, keys, changes);
      // Wrapped: a promise returned as is would hold the queue until the server answers.
      return {
        done: Promise.all([
          ...[...changes.removals].map((key) => this.saves.remove(key)),
          ...[...changes.writes]
            .filter(([key]) => !changes.removals.has(key))
            .map(([key, value]) => this.saves.write(key, value)),
        ]),
      };
    });
    await sent.done;
  }

  /**
   * Keeps a slot within its room: the last `rewindPoints` rewind points, the log chunks
   * holding the last `journalEntries` lines; then, if the slot is still too heavy, drops the
   * oldest log chunks (the open one stays), then the oldest rewind points.
   */
  private trim(slot: SlotId, keys: Map<string, number>, changes: Changes): void {
    const drop = (key: string) => {
      changes.removals.add(key);
      keys.delete(key);
    };
    const points = checkpointKeys(keys.keys(), slot);
    while (points.length > this.limits.rewindPoints) drop(points.shift()?.key ?? '');
    const chunks = journalKeys(keys.keys(), slot);
    const maxChunks = Math.ceil(this.limits.journalEntries / this.budget.journalChunkLines) + 1;
    while (chunks.length > maxChunks) drop(chunks.shift()?.key ?? '');
    const size = () =>
      slotKeys(keys.keys(), slot).reduce((total, key) => total + (keys.get(key) ?? 0), 0);
    while (size() > this.budget.slotBytes) {
      if (chunks.length > 1) drop(chunks.shift()?.key ?? '');
      else if (points.length > 0) drop(points.shift()?.key ?? '');
      else break;
    }
    for (const key of changes.removals) {
      this.checkpoints.delete(key);
    }
  }

  async listSlots(): Promise<Map<SlotId, SlotSummary>> {
    const keys = await this.keys();
    const found = await Promise.all(
      SLOT_IDS.filter((slot) => keys.has(slotKey(slot))).map(async (slot) => {
        const known = this.summaries.get(slot);
        if (known) return known;
        const value = await this.read(slotKey(slot));
        if (value === null) return null;
        const { header } = parseValue<SlotHeader>(value);
        const summary: SlotSummary = {
          slot,
          savedAt: header.savedAt,
          gameDate: header.gameDate,
          gameHour: header.gameHour,
        };
        this.summaries.set(slot, summary);
        return summary;
      }),
    );
    return new Map(found.flatMap((summary) => (summary ? [[summary.slot, summary]] : [])));
  }

  async readGame(slot: SlotId): Promise<string | null> {
    const value = await this.read(slotKey(slot));
    if (value === null) return null;
    const { header, payload } = parseValue<SlotHeader>(value);
    return this.decode(header, payload);
  }

  writeGame(summary: SlotSummary, game: string, options: WriteOptions = {}): Promise<void> {
    const { slot } = summary;
    return this.change(slot, async (keys, changes) => {
      if (options.fresh) this.forget(slot, keys, changes, { keepGame: true });
      const { encoding, data } = await this.encode(game);
      const slotHeader: SlotHeader = {
        format: VALUE_FORMAT,
        encoding,
        savedAt: summary.savedAt,
        gameDate: summary.gameDate,
        gameHour: summary.gameHour,
      };
      changes.writes.set(slotKey(slot), `${JSON.stringify(slotHeader)}\n${data}`);
      this.summaries.set(slot, summary);
      if (options.checkpoint) {
        const { date, netWorth } = options.checkpoint;
        const header: CheckpointHeader = { format: VALUE_FORMAT, encoding, date, netWorth };
        const key = checkpointKey(slot, date);
        changes.writes.set(key, `${JSON.stringify(header)}\n${data}`);
        this.checkpoints.set(key, { date, netWorth });
      }
    });
  }

  async listCheckpoints(slot: SlotId): Promise<Checkpoint[]> {
    const keys = await this.keys();
    const points = await Promise.all(
      checkpointKeys(keys.keys(), slot).map(async ({ key }) => {
        const known = this.checkpoints.get(key);
        if (known) return known;
        const value = await this.read(key);
        if (value === null) return null;
        const { date, netWorth } = parseValue<CheckpointHeader>(value).header;
        this.checkpoints.set(key, { date, netWorth });
        return { date, netWorth };
      }),
    );
    return points.filter((point): point is Checkpoint => point !== null);
  }

  async readCheckpoint(slot: SlotId, date: CalendarDate): Promise<string | null> {
    const value = await this.read(checkpointKey(slot, date));
    if (value === null) return null;
    const { header, payload } = parseValue<CheckpointHeader>(value);
    return this.decode(header, payload);
  }

  dropCheckpointsFrom(slot: SlotId, date: CalendarDate): Promise<void> {
    return this.change(slot, async (keys, changes) => {
      for (const point of checkpointKeys(keys.keys(), slot)) {
        if (dateKey(point.date) > dateKey(date)) changes.removals.add(point.key);
      }
    });
  }

  /** The open chunk of a slot's log: the last one on the server, read once per session. */
  private async openChunk(slot: SlotId, keys: Map<string, number>): Promise<OpenChunk> {
    const known = this.chunks.get(slot);
    if (known) return known;
    const last = journalKeys(keys.keys(), slot).at(-1);
    let chunk: OpenChunk = { index: 0, lines: [], bytes: 0 };
    if (last) {
      chunk = { index: last.index + 1, lines: [], bytes: 0 };
      try {
        const lines = await this.readChunk(last.key);
        if (lines.length < this.budget.journalChunkLines) {
          chunk = { index: last.index, lines, bytes: utf8Bytes(lines.join('\n')) };
        }
      } catch {
        // Unreadable chunk: kept as it is, the log goes on in the next one.
      }
    }
    this.chunks.set(slot, chunk);
    return chunk;
  }

  private async readChunk(key: string): Promise<string[]> {
    const value = await this.read(key);
    if (value === null) return [];
    const { header, payload } = parseValue<Header>(value);
    const text = await this.decode(header, payload);
    return text === '' ? [] : text.split('\n');
  }

  appendJournal(slot: SlotId, entries: readonly JournalEntry[]): Promise<void> {
    if (entries.length === 0) return Promise.resolve();
    return this.change(slot, async (keys, changes) => {
      let chunk = await this.openChunk(slot, keys);
      const full: OpenChunk[] = [];
      for (const entry of entries) {
        const line = JSON.stringify(entry);
        const bytes = utf8Bytes(line) + 1;
        if (
          chunk.lines.length > 0 &&
          (chunk.lines.length >= this.budget.journalChunkLines ||
            chunk.bytes + bytes > this.budget.journalChunkBytes)
        ) {
          full.push(chunk);
          chunk = { index: chunk.index + 1, lines: [], bytes: 0 };
        }
        chunk.lines.push(line);
        chunk.bytes += bytes;
      }
      this.chunks.set(slot, chunk);
      for (const written of [...full, chunk]) {
        const { encoding, data } = await this.encode(written.lines.join('\n'));
        const header = { format: VALUE_FORMAT, encoding, lines: written.lines.length };
        changes.writes.set(journalKey(slot, written.index), `${JSON.stringify(header)}\n${data}`);
      }
    });
  }

  async readJournal(slot: SlotId): Promise<JournalEntry[]> {
    // After the appends already asked for: the open chunk is read from memory.
    const { keys, open } = await this.queued(slot, async () => ({
      keys: [...(await this.keys()).keys()],
      open: this.chunks.get(slot),
    }));
    const chunks = await Promise.all(
      journalKeys(keys, slot).map(({ key, index }) =>
        open?.index === index ? open.lines : this.readChunk(key).catch(() => []),
      ),
    );
    const lines = chunks.flat().slice(-this.limits.journalEntries);
    return lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as JournalEntry];
      } catch {
        return [];
      }
    });
  }

  deleteSlot(slot: SlotId): Promise<void> {
    return this.change(slot, async (keys, changes) => {
      this.forget(slot, keys, changes, { keepGame: false });
    });
  }

  /** Removes a slot's rewind points and log (and its game unless `keepGame`). */
  private forget(
    slot: SlotId,
    keys: Map<string, number>,
    changes: Changes,
    { keepGame }: { keepGame: boolean },
  ): void {
    for (const key of slotKeys(keys.keys(), slot)) {
      if (keepGame && key === slotKey(slot)) continue;
      changes.removals.add(key);
      keys.delete(key);
      this.checkpoints.delete(key);
    }
    this.chunks.delete(slot);
    if (!keepGame) this.summaries.delete(slot);
  }
}
