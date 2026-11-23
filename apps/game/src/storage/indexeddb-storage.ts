import type { CalendarDate } from '@cle/engine';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import {
  type Checkpoint,
  createQueue,
  dateKey,
  type JournalEntry,
  type SaveLimits,
  type SaveStorage,
  type SlotId,
  type SlotSummary,
  type WriteOptions,
} from './save-storage.ts';

/** A rewind point as kept in IndexedDB: with its serialized game (migrated on load). */
interface StoredCheckpoint extends Checkpoint {
  game: string;
}

interface SlotRecord extends SlotSummary {
  /** Serialized engine state; migrated on load. */
  game: string;
  /** The last monthly rewind points, oldest first. */
  checkpoints: StoredCheckpoint[];
}

interface SavesDb extends DBSchema {
  slots: { key: SlotId; value: SlotRecord };
  journal: { key: SlotId; value: { slot: SlotId; entries: JournalEntry[] } };
}

const DB_NAME = 'cle-en-main';
const DB_VERSION = 2;

/** Points saved before milestone 6 were plain strings (always empty in practice). */
function checkpointsOf(record: SlotRecord | undefined): StoredCheckpoint[] {
  return (record?.checkpoints ?? []).filter(
    (point): point is StoredCheckpoint => typeof point === 'object' && point !== null,
  );
}

/**
 * The games in the browser's IndexedDB (docs/07-architecture.md, 7.5): one record per slot,
 * with its game and its rewind points, and one record per slot for its log. The storage of
 * the game outside DomoThib, unchanged since milestone 6.
 */
export class IndexedDbSaveStorage implements SaveStorage {
  private dbPromise: Promise<IDBPDatabase<SavesDb>> | undefined;
  /** Each slot is read, changed and written back: one task at a time per slot. */
  private readonly queued = createQueue<SlotId>();
  private readonly limits: SaveLimits;

  constructor(limits: SaveLimits) {
    this.limits = limits;
  }

  private db(): Promise<IDBPDatabase<SavesDb>> {
    this.dbPromise ??= openDB<SavesDb>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) database.createObjectStore('slots', { keyPath: 'slot' });
        if (oldVersion < 2) database.createObjectStore('journal', { keyPath: 'slot' });
      },
    });
    return this.dbPromise;
  }

  async listSlots(): Promise<Map<SlotId, SlotSummary>> {
    const records = await (await this.db()).getAll('slots');
    return new Map(
      records.map(({ slot, savedAt, gameDate, gameHour }) => [
        slot,
        { slot, savedAt, gameDate, gameHour },
      ]),
    );
  }

  async readGame(slot: SlotId): Promise<string | null> {
    return (await (await this.db()).get('slots', slot))?.game ?? null;
  }

  writeGame(summary: SlotSummary, game: string, options: WriteOptions = {}): Promise<void> {
    return this.queued(summary.slot, async () => {
      const database = await this.db();
      const previous = options.fresh ? undefined : await database.get('slots', summary.slot);
      let checkpoints = checkpointsOf(previous);
      if (options.checkpoint) {
        checkpoints = [...checkpoints, { ...options.checkpoint, game }].slice(
          -this.limits.rewindPoints,
        );
      }
      await database.put('slots', { ...summary, game, checkpoints });
      if (options.fresh) await database.delete('journal', summary.slot);
    });
  }

  async listCheckpoints(slot: SlotId): Promise<Checkpoint[]> {
    return checkpointsOf(await (await this.db()).get('slots', slot)).map(({ date, netWorth }) => ({
      date,
      netWorth,
    }));
  }

  async readCheckpoint(slot: SlotId, date: CalendarDate): Promise<string | null> {
    const points = checkpointsOf(await (await this.db()).get('slots', slot));
    return points.find((point) => dateKey(point.date) === dateKey(date))?.game ?? null;
  }

  dropCheckpointsFrom(slot: SlotId, date: CalendarDate): Promise<void> {
    return this.queued(slot, async () => {
      const database = await this.db();
      const record = await database.get('slots', slot);
      if (!record) return;
      record.checkpoints = checkpointsOf(record).filter(
        (point) => dateKey(point.date) <= dateKey(date),
      );
      await database.put('slots', record);
    });
  }

  async readJournal(slot: SlotId): Promise<JournalEntry[]> {
    return (await (await this.db()).get('journal', slot))?.entries ?? [];
  }

  /** Appends lines to the slot's log, keeping the most recent ones (content/rythme.json). */
  async appendJournal(slot: SlotId, entries: readonly JournalEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const database = await this.db();
    const previous = (await database.get('journal', slot))?.entries ?? [];
    const kept = [...previous, ...entries].slice(-this.limits.journalEntries);
    await database.put('journal', { slot, entries: kept });
  }

  deleteSlot(slot: SlotId): Promise<void> {
    return this.queued(slot, async () => {
      const database = await this.db();
      await database.delete('slots', slot);
      await database.delete('journal', slot);
    });
  }
}
