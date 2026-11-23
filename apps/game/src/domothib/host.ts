import { DomoThibSaveStorage } from '../storage/domothib-storage.ts';
import { SAVE_LIMITS, setSaveStorage } from '../storage/saves.ts';
import { connectDomoThib, type DomoThib } from './domothib-games.ts';

/**
 * Connects the game to DomoThib (docs/domothib.md, §4), before any slot is read: with the
 * saves on the server, the slots, rewind points and log go there; otherwise (`saves` null,
 * or the game opened outside DomoThib) they stay in IndexedDB.
 */
export async function connectHost(): Promise<DomoThib | null> {
  const domothib = await connectDomoThib();
  if (domothib?.saves) {
    const storage = new DomoThibSaveStorage(domothib.saves, SAVE_LIMITS);
    // Out of reach now: the keys are listed again at the first read.
    await storage.open().catch(() => undefined);
    setSaveStorage(storage);
  }
  return domothib;
}
