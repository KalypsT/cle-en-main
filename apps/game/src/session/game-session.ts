import { timeSettings } from '@cle/content';
import {
  decisionKey,
  type DispatchResult,
  type GameAction,
  type GameEvent,
  type GameState,
  HOURS_PER_DAY,
  type PendingDecision,
  toDayNumber,
} from '@cle/engine';
import { engine } from '../engine.ts';
import { describeEvent } from '../texts.ts';

/** Ignore longer frame gaps (tab in background, debugger) instead of fast-forwarding. */
const MAX_FRAME_MS = 1000;
/** News kept for the dashboard. */
const FEED_LENGTH = 30;

export interface FeedItem {
  id: number;
  /** Game day number the news happened on. */
  day: number;
  text: string;
}

export interface SessionSnapshot {
  state: GameState;
  /** 0 when paused, otherwise one of timeSettings.speeds. */
  speed: number;
  lastEvent: GameEvent | null;
  /** Latest news, newest first. */
  feed: FeedItem[];
  /** Pending decisions of `state` (engine.pendingDecisions). */
  decisions: PendingDecision[];
  /** The game paused itself for a decision. */
  autoPaused: boolean;
}

export interface SessionOptions {
  /** Real seconds per game day at ×1 (content/temps.json; shorter in end-to-end tests). */
  realSecondsPerGameDay?: number;
  /** Read on each new decision: the player may switch the automatic pause off. */
  autoPause?: () => boolean;
  /** Speed on start (×1 by default; end-to-end tests start paused). */
  initialSpeed?: number;
}

type Listener = () => void;
type EventListener = (events: GameEvent[], state: GameState) => void;

/**
 * Drives the engine in real time and exposes its state to React through
 * `subscribe` / `getSnapshot` (useSyncExternalStore). It never computes game
 * rules itself: it calls `tick`, `dispatch` and the engine's queries.
 */
export class GameSession {
  private snapshot: SessionSnapshot;
  private readonly listeners = new Set<Listener>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly msPerHour: number;
  private readonly autoPause: () => boolean;
  /** Decisions already shown: only new ones pause the game. */
  private seenDecisions: Set<string>;
  private frame: number | null = null;
  private lastFrameAt: number | null = null;
  private pendingMs = 0;
  private nextFeedId = 1;

  constructor(state: GameState, onEvents: EventListener, options: SessionOptions = {}) {
    const decisions = engine.pendingDecisions(state);
    this.snapshot = {
      state,
      speed: options.initialSpeed ?? timeSettings.speeds[0] ?? 1,
      lastEvent: null,
      feed: [],
      decisions,
      autoPaused: false,
    };
    this.seenDecisions = new Set(decisions.map(decisionKey));
    this.eventListeners.add(onEvents);
    const seconds = options.realSecondsPerGameDay ?? timeSettings.realSecondsPerGameDay;
    this.msPerHour = (seconds * 1000) / HOURS_PER_DAY;
    this.autoPause = options.autoPause ?? (() => true);
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SessionSnapshot => this.snapshot;

  /** Listens to every event of the engine (ticks and actions). */
  onEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

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
    this.update({ speed, autoPaused: false });
  }

  dispatch(action: GameAction): DispatchResult {
    const result = engine.dispatch(this.snapshot.state, action);
    if (result.ok) this.applyEvents(result.state, result.events, false);
    return result;
  }

  private readonly onFrame = (now: number): void => {
    const elapsed = this.lastFrameAt === null ? 0 : Math.min(now - this.lastFrameAt, MAX_FRAME_MS);
    this.lastFrameAt = now;
    if (this.snapshot.speed > 0) {
      this.pendingMs += elapsed * this.snapshot.speed;
      let state = this.snapshot.state;
      const events: GameEvent[] = [];
      while (this.pendingMs >= this.msPerHour) {
        this.pendingMs -= this.msPerHour;
        const result = engine.tick(state);
        state = result.state;
        events.push(...result.events);
        // Stop at the first new decision that pauses the game.
        if (result.events.length > 0 && this.pausesFor(state)) {
          this.pendingMs = 0;
          break;
        }
      }
      if (state !== this.snapshot.state) this.applyEvents(state, events, true);
    }
    this.frame = requestAnimationFrame(this.onFrame);
  };

  /** True when `state` has a new decision that should pause the game. */
  private pausesFor(state: GameState): boolean {
    if (!this.autoPause()) return false;
    return engine
      .pendingDecisions(state)
      .some((decision) => decision.autoPause && !this.seenDecisions.has(decisionKey(decision)));
  }

  private applyEvents(state: GameState, events: GameEvent[], ticking: boolean): void {
    const changes: Partial<SessionSnapshot> = { state };
    if (events.length > 0 || !ticking) {
      const decisions = engine.pendingDecisions(state);
      const fresh = decisions.filter((d) => !this.seenDecisions.has(decisionKey(d)));
      this.seenDecisions = new Set(decisions.map(decisionKey));
      changes.decisions = decisions;
      if (ticking && this.autoPause() && fresh.some((decision) => decision.autoPause)) {
        this.pendingMs = 0;
        changes.speed = 0;
        changes.autoPaused = true;
      }
    }
    const shown = events
      .map((event) => ({ event, text: describeEvent(event) }))
      .filter((item): item is { event: GameEvent; text: string } => item.text !== null)
      // Calendar ticks are not news.
      .filter(({ event }) => event.type !== 'dayStarted' && event.type !== 'weekendStarted');
    if (shown.length > 0) {
      const day = toDayNumber(state.clock.date);
      const items = shown.map(({ text }) => ({ id: this.nextFeedId++, day, text })).reverse();
      changes.feed = [...items, ...this.snapshot.feed].slice(0, FEED_LENGTH);
      changes.lastEvent = shown.at(-1)?.event ?? this.snapshot.lastEvent;
    }
    this.update(changes);
    if (events.length > 0) for (const listener of this.eventListeners) listener(events, state);
  }

  private update(changes: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) listener();
  }
}
