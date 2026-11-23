import { gameContent } from '@cle/content';
import { type CalendarDate, type GameState, serializeGame } from '@cle/engine';
import { engine } from '../engine.ts';
import { IndexedDbSaveStorage } from './indexeddb-storage.ts';
import {
  type Checkpoint,
  type JournalEntry,
  type SaveLimits,
  type SaveStorage,
  SLOT_IDS,
  type SlotId,
  type SlotSummary,
} from './save-storage.ts';

export { SLOT_IDS };
export type { Checkpoint, JournalEntry, SlotId, SlotSummary } from './save-storage.ts';

/** How many rewind points and log lines each slot keeps. */
export const SAVE_LIMITS: SaveLimits = {
  rewindPoints: gameContent.rhythm.rewindPoints,
  journalEntries: gameContent.rhythm.journalEntries,
};

/** IndexedDB, unless the game runs in DomoThib with its saves on the server (main.tsx). */
let storage: SaveStorage = new IndexedDbSaveStorage(SAVE_LIMITS);

/** Chooses where the games are kept; called once at launch, before any slot is read. */
export function setSaveStorage(next: SaveStorage): void {
  storage = next;
}

export function listSlots(): Promise<Map<SlotId, SlotSummary>> {
  return storage.listSlots();
}

/**
 * Saves a game; `checkpoint` also keeps it as a monthly rewind point (the
 * 1st of the month), and a new game (`fresh`) starts without any.
 */
export async function saveToSlot(
  slot: SlotId,
  state: GameState,
  options: { checkpoint?: boolean; fresh?: boolean } = {},
): Promise<void> {
  // Serialized before any wait: a save made as the page hides must catch this state.
  const game = serializeGame(state);
  const summary: SlotSummary = {
    slot,
    savedAt: Date.now(),
    gameDate: state.clock.date,
    gameHour: state.clock.hour,
  };
  await storage.writeGame(summary, game, {
    ...(options.checkpoint
      ? { checkpoint: { date: state.clock.date, netWorth: engine.netWorth(state) } }
      : {}),
    ...(options.fresh ? { fresh: true } : {}),
  });
}

/** Loads a slot; throws SaveFormatError when the stored game is invalid. */
export async function loadFromSlot(slot: SlotId): Promise<GameState | null> {
  const game = await storage.readGame(slot);
  return game === null ? null : engine.loadGame(game);
}

export function listCheckpoints(slot: SlotId): Promise<Checkpoint[]> {
  return storage.listCheckpoints(slot);
}

/** The game of a rewind point, migrated; throws SaveFormatError when invalid. */
export async function loadCheckpoint(slot: SlotId, point: Checkpoint): Promise<GameState | null> {
  const game = await storage.readCheckpoint(slot, point.date);
  return game === null ? null : engine.loadGame(game);
}

/** Keeps only the rewind points up to `date` (after a rewind, the later ones are gone). */
export function dropCheckpointsFrom(slot: SlotId, date: CalendarDate): Promise<void> {
  return storage.dropCheckpointsFrom(slot, date);
}

export function readJournal(slot: SlotId): Promise<JournalEntry[]> {
  return storage.readJournal(slot);
}

/** Appends lines to the slot's log, keeping the most recent ones (content/rythme.json). */
export function appendJournal(slot: SlotId, entries: JournalEntry[]): Promise<void> {
  return storage.appendJournal(slot, entries);
}

const LAST_SLOT_KEY = 'cle-en-main.lastSlot';

/** The slot played last on this device, reopened at launch; null after « Quitter ». */
export function lastSlot(): SlotId | null {
  try {
    const value = Number(localStorage.getItem(LAST_SLOT_KEY));
    return SLOT_IDS.find((slot) => slot === value) ?? null;
  } catch {
    return null;
  }
}

export function rememberSlot(slot: SlotId | null): void {
  try {
    if (slot === null) localStorage.removeItem(LAST_SLOT_KEY);
    else localStorage.setItem(LAST_SLOT_KEY, String(slot));
  } catch {
    // Storage unavailable: the game opens on the title screen.
  }
}
