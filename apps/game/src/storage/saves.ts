import { type CalendarDate, deserializeGame, type GameState, serializeGame } from '@cle/engine';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

/** Three save slots (docs/07-architecture.md, section 7.5). */
export const SLOT_IDS = [1, 2, 3] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export interface SlotRecord {
  slot: SlotId;
  /** Real-world time of the save, in milliseconds since the Unix epoch. */
  savedAt: number;
  gameDate: CalendarDate;
  gameHour: number;
  /** Serialized engine state; migrated on load. */
  game: string;
  /** Monthly rewind points (docs/02, section 2.7), filled from milestone 4 on. */
  checkpoints: string[];
}

interface SavesDb extends DBSchema {
  slots: { key: SlotId; value: SlotRecord };
}

const DB_NAME = 'cle-en-main';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SavesDb>> | undefined;

function db(): Promise<IDBPDatabase<SavesDb>> {
  dbPromise ??= openDB<SavesDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore('slots', { keyPath: 'slot' });
    },
  });
  return dbPromise;
}

export async function listSlots(): Promise<Map<SlotId, SlotRecord>> {
  const records = await (await db()).getAll('slots');
  return new Map(records.map((record) => [record.slot, record]));
}

export async function saveToSlot(slot: SlotId, state: GameState): Promise<SlotRecord> {
  const database = await db();
  const previous = await database.get('slots', slot);
  const record: SlotRecord = {
    slot,
    savedAt: Date.now(),
    gameDate: state.clock.date,
    gameHour: state.clock.hour,
    game: serializeGame(state),
    checkpoints: previous?.checkpoints ?? [],
  };
  await database.put('slots', record);
  return record;
}

/** Loads a slot; throws SaveFormatError when the stored game is invalid. */
export async function loadFromSlot(slot: SlotId): Promise<GameState | null> {
  const record = await (await db()).get('slots', slot);
  return record ? deserializeGame(record.game) : null;
}
