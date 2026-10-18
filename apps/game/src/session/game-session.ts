import { timeSettings } from '@cle/content';
import {
  type DispatchResult,
  type GameAction,
  type GameEvent,
  type GameState,
  HOURS_PER_DAY,
} from '@cle/engine';
import { engine } from '../engine.ts';
import { describeEvent } from '../texts.ts';

/** Real milliseconds per game hour at speed ×1. */
const MS_PER_HOUR = (timeSettings.realSecondsPerGameDay * 1000) / HOURS_PER_DAY;
/** Ignore longer frame gaps (tab in background, debugger) instead of fast-forwarding. */
const MAX_FRAME_MS = 1000;

export interface SessionSnapshot {
  state: GameState;
  /** 0 when paused, otherwise one of timeSettings.speeds. */
  speed: number;
  lastEvent: GameEvent | null;
}

type Listener = () => void;

/**
 * Drives the engine in real time and exposes its state to React through
 * `subscribe` / `getSnapshot` (useSyncExternalStore). It never computes game
 * rules itself: it only calls `tick` and `dispatch`.
 */
export class GameSession {
  private snapshot: SessionSnapshot;
  private readonly listeners = new Set<Listener>();
  private readonly onEvents: (events: GameEvent[], state: GameState) => void;
  private frame: number | null = null;
  private lastFrameAt: number | null = null;
  private pendingMs = 0;

  constructor(state: GameState, onEvents: (events: GameEvent[], state: GameState) => void) {
    this.snapshot = { state, speed: timeSettings.speeds[0] ?? 1, lastEvent: null };
    this.onEvents = onEvents;
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SessionSnapshot => this.snapshot;

  start(): void {
    if (this.frame !== null) return;
    this.lastFrameAt = null;
    this.frame = requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  setSpeed(speed: number): void {
    this.pendingMs = 0;
    this.update({ speed });
  }

  dispatch(action: GameAction): DispatchResult {
    const result = engine.dispatch(this.snapshot.state, action);
    if (result.ok) this.applyEvents(result.state, result.events);
    return result;
  }

  private readonly onFrame = (now: number): void => {
    const elapsed = this.lastFrameAt === null ? 0 : Math.min(now - this.lastFrameAt, MAX_FRAME_MS);
    this.lastFrameAt = now;
    if (this.snapshot.speed > 0) {
      this.pendingMs += elapsed * this.snapshot.speed;
      let state = this.snapshot.state;
      const events: GameEvent[] = [];
      while (this.pendingMs >= MS_PER_HOUR) {
        this.pendingMs -= MS_PER_HOUR;
        const result = engine.tick(state);
        state = result.state;
        events.push(...result.events);
      }
      if (state !== this.snapshot.state) this.applyEvents(state, events);
    }
    this.frame = requestAnimationFrame(this.onFrame);
  };

  private applyEvents(state: GameState, events: GameEvent[]): void {
    const shown = events.filter((event) => describeEvent(event) !== null);
    this.update({ state, lastEvent: shown.at(-1) ?? this.snapshot.lastEvent });
    if (events.length > 0) this.onEvents(events, state);
  }

  private update(changes: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) listener();
  }
}
