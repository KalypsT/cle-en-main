import type { TabId } from './context.tsx';

/** Where each screen of each tab's stack was scrolled to, so that coming back puts it there again. */
export class ScrollMemory {
  private readonly positions = new Map<string, number>();

  private key(tab: TabId, depth: number): string {
    return `${tab}:${depth}`;
  }

  save(tab: TabId, depth: number, y: number): void {
    this.positions.set(this.key(tab, depth), y);
  }

  get(tab: TabId, depth: number): number {
    return this.positions.get(this.key(tab, depth)) ?? 0;
  }

  forget(tab: TabId, depth: number): void {
    this.positions.delete(this.key(tab, depth));
  }

  /** Forgets a whole tab (its stack was emptied or replaced). */
  forgetTab(tab: TabId): void {
    for (const key of [...this.positions.keys()]) {
      if (key.startsWith(`${tab}:`)) this.positions.delete(key);
    }
  }
}
