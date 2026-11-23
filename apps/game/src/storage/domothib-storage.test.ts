import { describe, expect, it } from 'vitest';
import { type DomoThibSaves, DomoThibError } from '../domothib/domothib-games.ts';
import { utf8Bytes } from './compression.ts';
import {
  DOMOTHIB_BUDGET,
  DOMOTHIB_LIMITS,
  type DomoThibBudget,
  DomoThibSaveStorage,
} from './domothib-storage.ts';
import type { JournalEntry, SaveLimits, SlotId, SlotSummary } from './save-storage.ts';

/** The DomoThib server as the game sees it: keys, revisions and the limits of the contract. */
class FakeSaves implements DomoThibSaves {
  readonly values = new Map<string, string>();
  /** Highest total and count reached: the limits must hold at every moment. */
  peakBytes = 0;
  peakEntries = 0;
  writes = 0;

  private total(): number {
    let total = 0;
    for (const value of this.values.values()) total += utf8Bytes(value);
    return total;
  }

  async list() {
    return [...this.values].map(([key, value], revision) => ({
      key,
      revision,
      size: utf8Bytes(value),
      modifiedAt: '2026-11-23T00:00:00Z',
    }));
  }

  async read(key: string) {
    return this.values.get(key) ?? null;
  }

  async readAll() {
    return Object.fromEntries(this.values);
  }

  async write(key: string, value: string) {
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(key)) throw new DomoThibError('invalid_key');
    if (utf8Bytes(value) > DOMOTHIB_LIMITS.valueBytes) throw new DomoThibError('too_large');
    const previous = this.values.get(key);
    const total = this.total() - (previous === undefined ? 0 : utf8Bytes(previous));
    const entries = this.values.size + (previous === undefined ? 1 : 0);
    if (entries > DOMOTHIB_LIMITS.entries || total + utf8Bytes(value) > DOMOTHIB_LIMITS.totalBytes)
      throw new DomoThibError('quota');
    this.values.set(key, value);
    this.writes += 1;
    this.peakBytes = Math.max(this.peakBytes, this.total());
    this.peakEntries = Math.max(this.peakEntries, this.values.size);
  }

  async remove(key: string) {
    this.values.delete(key);
  }

  openSync(): never {
    throw new Error('not used');
  }

  keys(prefix: string): string[] {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}

const LIMITS: SaveLimits = { rewindPoints: 6, journalEntries: 500 };
const BUDGET: DomoThibBudget = { ...DOMOTHIB_BUDGET, journalChunkLines: 100 };

const summary = (slot: SlotId, month = 1, year = 2027): SlotSummary => ({
  slot,
  savedAt: Date.UTC(2026, 10, 23),
  gameDate: { year, month, day: 1 },
  gameHour: 8,
});

/** A game-like text: repetitive JSON, as a serialized game is. */
function fakeGame(label: string, size = 50_000): string {
  const item = JSON.stringify({ id: label, rent: 52_000, dpe: 'D', history: ['a', 'b'] });
  return JSON.stringify({ label, items: Array.from({ length: size / item.length }, () => item) });
}

/** A text that gzip cannot shrink much (to fill the room quickly). */
function noise(bytes: number, seed: number): string {
  let state = seed;
  let text = '';
  while (text.length < bytes) {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    text += state.toString(36);
  }
  return text.slice(0, bytes);
}

const entry = (hour: number): JournalEntry => ({
  hour,
  date: '2027-01-01',
  kind: 'event',
  data: { type: 'rentPaid', amount: hour },
});

function storage(saves: FakeSaves, budget = BUDGET) {
  return new DomoThibSaveStorage(saves, LIMITS, { budget });
}

describe('DomoThibSaveStorage', () => {
  it('saves a slot under slot-<n>, compressed, and reads it back on another screen', async () => {
    const saves = new FakeSaves();
    const game = fakeGame('one');
    await storage(saves).writeGame(summary(2), game);
    expect(saves.keys('')).toEqual(['slot-2']);
    expect(utf8Bytes(saves.values.get('slot-2') ?? '')).toBeLessThan(game.length / 5);

    const other = storage(saves);
    await other.open();
    expect([...(await other.listSlots()).values()]).toEqual([summary(2)]);
    expect(await other.readGame(2)).toBe(game);
    expect(await other.readGame(1)).toBeNull();
  });

  it('keeps working without compression', async () => {
    const saves = new FakeSaves();
    const game = fakeGame('plain');
    await new DomoThibSaveStorage(saves, LIMITS, { compress: false }).writeGame(summary(1), game);
    expect(saves.values.get('slot-1')?.endsWith(game)).toBe(true);
    expect(await storage(saves).readGame(1)).toBe(game);
  });

  it('keeps the last rewind points under checkpoint-<n>-<date>', async () => {
    const saves = new FakeSaves();
    const store = storage(saves);
    for (let month = 1; month <= 9; month++) {
      const { gameDate } = summary(1, month);
      await store.writeGame(summary(1, month), fakeGame(`m${month}`), {
        checkpoint: { date: gameDate, netWorth: month * 100 },
      });
    }
    expect(saves.keys('checkpoint-')).toEqual(
      [4, 5, 6, 7, 8, 9].map((month) => `checkpoint-1-2027-0${month}-01`),
    );
    const other = storage(saves);
    const points = await other.listCheckpoints(1);
    expect(points.map((point) => point.netWorth)).toEqual([400, 500, 600, 700, 800, 900]);
    expect(await other.readCheckpoint(1, { year: 2027, month: 5, day: 1 })).toBe(fakeGame('m5'));
    expect(await other.readCheckpoint(1, { year: 2027, month: 2, day: 1 })).toBeNull();
  });

  it('removes the later rewind points after a rewind', async () => {
    const saves = new FakeSaves();
    const store = storage(saves);
    for (let month = 1; month <= 4; month++) {
      const { gameDate } = summary(3, month);
      await store.writeGame(summary(3, month), fakeGame(`m${month}`), {
        checkpoint: { date: gameDate, netWorth: month },
      });
    }
    await store.dropCheckpointsFrom(3, { year: 2027, month: 2, day: 1 });
    expect(saves.keys('checkpoint-')).toEqual([
      'checkpoint-3-2027-01-01',
      'checkpoint-3-2027-02-01',
    ]);
    expect((await store.listCheckpoints(3)).map((point) => point.netWorth)).toEqual([1, 2]);
  });

  it('cuts the log into chunks and keeps its last lines', async () => {
    const saves = new FakeSaves();
    const store = storage(saves);
    for (let hour = 0; hour < 1234; hour += 40) {
      const batch = Array.from({ length: Math.min(40, 1234 - hour) }, (_, i) => entry(hour + i));
      await store.appendJournal(1, batch);
    }
    // 500 lines kept in chunks of 100: the 6 last chunks (5 full, 1 open).
    expect(saves.keys('journal-')).toEqual(
      [7, 8, 9, 10, 11, 12].map((index) => `journal-1-${index}`).sort(),
    );
    const lines = await store.readJournal(1);
    expect(lines).toHaveLength(500);
    expect(lines[0]).toEqual(entry(734));
    expect(lines.at(-1)).toEqual(entry(1233));
  });

  it('goes on with the open chunk of the log after a reload', async () => {
    const saves = new FakeSaves();
    await storage(saves).appendJournal(2, [entry(0), entry(1)]);
    const other = storage(saves);
    await other.appendJournal(2, [entry(2)]);
    expect(saves.keys('journal-')).toEqual(['journal-2-0']);
    expect(await storage(saves).readJournal(2)).toEqual([entry(0), entry(1), entry(2)]);
  });

  it('starts a new chunk when a line would make it too heavy', async () => {
    const saves = new FakeSaves();
    const store = storage(saves, { ...BUDGET, journalChunkBytes: 1000 });
    const big = (hour: number): JournalEntry => ({ ...entry(hour), data: 'x'.repeat(400) });
    await store.appendJournal(1, [big(0), big(1), big(2), big(3), big(4)]);
    expect(saves.keys('journal-')).toEqual(['journal-1-0', 'journal-1-1', 'journal-1-2']);
    expect((await store.readJournal(1)).map((line) => line.hour)).toEqual([0, 1, 2, 3, 4]);
  });

  it('drops the rewind points and the log of a slot for a new game, and all its keys on deletion', async () => {
    const saves = new FakeSaves();
    const store = storage(saves);
    for (const slot of [1, 2] as const) {
      await store.writeGame(summary(slot), fakeGame('old'), {
        checkpoint: { date: summary(slot).gameDate, netWorth: 1 },
      });
      await store.appendJournal(slot, [entry(1)]);
    }
    await store.writeGame(summary(1, 6), fakeGame('new'), { fresh: true });
    expect(saves.keys('')).toEqual(['checkpoint-2-2027-01-01', 'journal-2-0', 'slot-1', 'slot-2']);
    expect(await store.readJournal(1)).toEqual([]);
    expect(await store.listCheckpoints(1)).toEqual([]);

    await store.appendJournal(1, [entry(9)]);
    await store.deleteSlot(2);
    expect(saves.keys('')).toEqual(['journal-1-0', 'slot-1']);
    expect([...(await store.listSlots()).keys()]).toEqual([1]);
    expect([...(await storage(saves).listSlots()).keys()]).toEqual([1]);
  });

  it('keeps a slot within its room: the log first, then the oldest rewind points', async () => {
    const saves = new FakeSaves();
    const room = { ...BUDGET, slotBytes: 400_000 };
    const store = new DomoThibSaveStorage(saves, LIMITS, { budget: room, compress: false });
    await store.appendJournal(
      1,
      Array.from({ length: 300 }, (_, i) => entry(i)),
    );
    for (let month = 1; month <= 6; month++) {
      const { gameDate } = summary(1, month);
      await store.writeGame(summary(1, month), noise(60_000, month), {
        checkpoint: { date: gameDate, netWorth: month },
      });
    }
    const slotBytes = [...saves.values.values()].reduce((sum, value) => sum + utf8Bytes(value), 0);
    expect(slotBytes).toBeLessThanOrEqual(400_000);
    // The open chunk of the log stays; the oldest rewind points went first.
    expect(saves.keys('journal-')).toEqual(['journal-1-2']);
    expect(saves.keys('checkpoint-')).toEqual(
      [2, 3, 4, 5, 6].map((month) => `checkpoint-1-2027-0${month}-01`),
    );
  });

  it('never goes over the limits of the server with three long games', async () => {
    const saves = new FakeSaves();
    const store = new DomoThibSaveStorage(saves, {
      rewindPoints: 6,
      journalEntries: 20_000,
    });
    // Games of 1.5 MiB that gzip only halves: far heavier than a real 25-year game (0.2 MiB).
    for (let month = 1; month <= 10; month++) {
      for (const slot of [1, 2, 3] as const) {
        const { gameDate } = summary(slot, month);
        await store.writeGame(summary(slot, month), noise(1.5 * 1024 * 1024, slot * 100 + month), {
          checkpoint: { date: gameDate, netWorth: month },
        });
        await store.appendJournal(
          slot,
          Array.from({ length: 2500 }, (_, i) => entry(month * 10_000 + i)),
        );
      }
    }
    expect(saves.peakBytes).toBeLessThanOrEqual(DOMOTHIB_LIMITS.totalBytes);
    expect(saves.peakEntries).toBeLessThanOrEqual(DOMOTHIB_LIMITS.entries);
    for (const slot of [1, 2, 3] as const) {
      const bytes = saves
        .keys('')
        .filter((key) => key === `slot-${slot}` || key.match(new RegExp(`^\\w+-${slot}-`)))
        .reduce((sum, key) => sum + utf8Bytes(saves.values.get(key) ?? ''), 0);
      expect(bytes).toBeLessThanOrEqual(DOMOTHIB_BUDGET.slotBytes);
      expect(saves.keys(`checkpoint-${slot}-`).length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('lists the keys again when the first listing failed', async () => {
    const saves = new FakeSaves();
    await storage(saves).writeGame(summary(1), fakeGame('one'));
    let failures = 1;
    const list = saves.list.bind(saves);
    saves.list = async () => {
      if (failures-- > 0) throw new DomoThibError('unavailable');
      return list();
    };
    const store = storage(saves);
    await expect(store.open()).rejects.toThrow(DomoThibError);
    expect([...(await store.listSlots()).keys()]).toEqual([1]);
  });

  it('reports a value refused by the server', async () => {
    const saves = new FakeSaves();
    const store = new DomoThibSaveStorage(saves, LIMITS, { compress: false });
    await expect(store.writeGame(summary(1), noise(3 * 1024 * 1024, 1))).rejects.toMatchObject({
      code: 'too_large',
    });
  });
});
