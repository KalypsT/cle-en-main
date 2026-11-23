import type { CalendarDate, Cents } from '@cle/engine';

/** Three save slots (docs/07-architecture.md, section 7.5). */
export const SLOT_IDS = [1, 2, 3] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/** What the slots screen shows of a saved game. */
export interface SlotSummary {
  slot: SlotId;
  /** Real-world time of the save, in milliseconds since the Unix epoch. */
  savedAt: number;
  gameDate: CalendarDate;
  gameHour: number;
}

/** A monthly rewind point (docs/02, section 2.7); its game is read with `readCheckpoint`. */
export interface Checkpoint {
  date: CalendarDate;
  netWorth: Cents;
}

/** One line of the game log (docs/08, 8.5): an engine event or a player action. */
export interface JournalEntry {
  /** Game hours since the start, then the game date for reading. */
  hour: number;
  date: string;
  kind: 'event' | 'action';
  data: unknown;
}

/** How many rewind points and log lines a slot keeps (content/rythme.json). */
export interface SaveLimits {
  rewindPoints: number;
  journalEntries: number;
}

export interface WriteOptions {
  /** Also keep this game as a rewind point (the 1st of the month). */
  checkpoint?: Checkpoint;
  /** A new game in the slot: its rewind points and its log are dropped first. */
  fresh?: boolean;
}

/**
 * Where the games are kept: IndexedDB in the browser (`indexeddb-storage.ts`), or the
 * DomoThib server when the game runs in DomoThib Games (`domothib-storage.ts`).
 * Games are passed already serialized (`serializeGame`), and read back as text.
 */
export interface SaveStorage {
  listSlots(): Promise<Map<SlotId, SlotSummary>>;
  /** The serialized game of a slot, or null when the slot is empty. */
  readGame(slot: SlotId): Promise<string | null>;
  /** Saves the game of a slot, keeping the last `rewindPoints` rewind points. */
  writeGame(summary: SlotSummary, game: string, options?: WriteOptions): Promise<void>;
  /** The rewind points of a slot, oldest first. */
  listCheckpoints(slot: SlotId): Promise<Checkpoint[]>;
  /** The serialized game of a rewind point, or null when it is gone. */
  readCheckpoint(slot: SlotId, date: CalendarDate): Promise<string | null>;
  /** Keeps only the rewind points up to `date` (after a rewind, the later ones are gone). */
  dropCheckpointsFrom(slot: SlotId, date: CalendarDate): Promise<void>;
  /** The slot's log, oldest line first (the last `journalEntries` lines). */
  readJournal(slot: SlotId): Promise<JournalEntry[]>;
  appendJournal(slot: SlotId, entries: readonly JournalEntry[]): Promise<void>;
  /** Removes the game, its rewind points and its log. */
  deleteSlot(slot: SlotId): Promise<void>;
}

/** Calendar order of two dates, as a number (YYYYMMDD). */
export function dateKey(date: CalendarDate): number {
  return date.year * 10_000 + date.month * 100 + date.day;
}

/**
 * Runs the tasks of each key one after the other: a save made as the app goes to the
 * background must not read a slot before the save of the 1st has written its rewind point,
 * then write it back without it.
 */
export function createQueue<K>() {
  const tails = new Map<K, Promise<unknown>>();
  return function queued<T>(key: K, task: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    tails.set(key, next);
    return next;
  };
}
