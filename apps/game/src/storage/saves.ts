import { gameContent } from '@cle/content';
import { type CalendarDate, type Cents, type GameState, serializeGame } from '@cle/engine';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { engine } from '../engine.ts';

/** Three save slots (docs/07-architecture.md, section 7.5). */
export const SLOT_IDS = [1, 2, 3] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/** A monthly rewind point (docs/02, section 2.7). */
export interface Checkpoint {
  date: CalendarDate;
  netWorth: Cents;
  /** Serialized engine state; migrated on load. */
  game: string;
}

export interface SlotRecord {
  slot: SlotId;
  /** Real-world time of the save, in milliseconds since the Unix epoch. */
  savedAt: number;
  gameDate: CalendarDate;
  gameHour: number;
  /** Serialized engine state; migrated on load. */
  game: string;
  /** The last monthly rewind points, oldest first. */
  checkpoints: Checkpoint[];
}

/** One line of the game log (docs/08, 8.5): an engine event or a player action. */
export interface JournalEntry {
  /** Game hours since the start, then the game date for reading. */
  hour: number;
  date: string;
  kind: 'event' | 'action';
  data: unknown;
}

interface SavesDb extends DBSchema {
  slots: { key: SlotId; value: SlotRecord };
  journal: { key: SlotId; value: { slot: SlotId; entries: JournalEntry[] } };
}

const DB_NAME = 'cle-en-main';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<SavesDb>> | undefined;

function db(): Promise<IDBPDatabase<SavesDb>> {
  dbPromise ??= openDB<SavesDb>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore('slots', { keyPath: 'slot' });
      if (oldVersion < 2) database.createObjectStore('journal', { keyPath: 'slot' });
    },
  });
  return dbPromise;
}

/** Points saved before milestone 6 were plain strings (always empty in practice). */
function checkpointsOf(record: SlotRecord | undefined): Checkpoint[] {
  return (record?.checkpoints ?? []).filter(
    (point): point is Checkpoint => typeof point === 'object' && point !== null,
  );
}

export async function listSlots(): Promise<Map<SlotId, SlotRecord>> {
  const records = await (await db()).getAll('slots');
  return new Map(records.map((record) => [record.slot, record]));
}

/**
 * Saves a game; `checkpoint` also keeps it as a monthly rewind point (the
 * 1st of the month), and a new game (`fresh`) starts without any.
 */
export async function saveToSlot(
  slot: SlotId,
  state: GameState,
  options: { checkpoint?: boolean; fresh?: boolean } = {},
): Promise<SlotRecord> {
  const database = await db();
  const previous = options.fresh ? undefined : await database.get('slots', slot);
  const game = serializeGame(state);
  let checkpoints = checkpointsOf(previous);
  if (options.checkpoint) {
    checkpoints = [
      ...checkpoints,
      { date: state.clock.date, netWorth: engine.netWorth(state), game },
    ].slice(-gameContent.rhythm.rewindPoints);
  }
  const record: SlotRecord = {
    slot,
    savedAt: Date.now(),
    gameDate: state.clock.date,
    gameHour: state.clock.hour,
    game,
    checkpoints,
  };
  await database.put('slots', record);
  if (options.fresh) await database.delete('journal', slot);
  return record;
}

/** Loads a slot; throws SaveFormatError when the stored game is invalid. */
export async function loadFromSlot(slot: SlotId): Promise<GameState | null> {
  const record = await (await db()).get('slots', slot);
  return record ? engine.loadGame(record.game) : null;
}

export async function listCheckpoints(slot: SlotId): Promise<Checkpoint[]> {
  return checkpointsOf(await (await db()).get('slots', slot));
}

/** Keeps only the rewind points up to `date` (after a rewind, the later ones are gone). */
export async function dropCheckpointsFrom(slot: SlotId, date: CalendarDate): Promise<void> {
  const database = await db();
  const record = await database.get('slots', slot);
  if (!record) return;
  const key = (d: CalendarDate) => d.year * 10_000 + d.month * 100 + d.day;
  record.checkpoints = checkpointsOf(record).filter((point) => key(point.date) <= key(date));
  await database.put('slots', record);
}

export async function readJournal(slot: SlotId): Promise<JournalEntry[]> {
  return (await (await db()).get('journal', slot))?.entries ?? [];
}

/** Appends lines to the slot's log, keeping the most recent ones (content/rythme.json). */
export async function appendJournal(slot: SlotId, entries: JournalEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const database = await db();
  const previous = (await database.get('journal', slot))?.entries ?? [];
  const kept = [...previous, ...entries].slice(-gameContent.rhythm.journalEntries);
  await database.put('journal', { slot, entries: kept });
}
