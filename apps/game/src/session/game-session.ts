import { gameContent, timeSettings } from '@cle/content';
import {
  decisionKey,
  type DispatchResult,
  type GameAction,
  type GameEvent,
  type GameState,
  HOURS_PER_DAY,
  type PendingDecision,
} from '@cle/engine';
import { engine } from '../engine.ts';

/** Ignore longer frame gaps (tab in background, debugger) instead of fast-forwarding. */
const MAX_FRAME_MS = 1000;
/**
 * At most one game day per frame: on a slow device, time runs slower instead
 * of catching up hours that make the next frame slower still.
 */
const MAX_HOURS_PER_FRAME = HOURS_PER_DAY;

export interface SessionSnapshot {
  state: GameState;
  /** 0 when paused, otherwise one of timeSettings.speeds. */
  speed: number;
  /** Pending decisions of `state` (engine.pendingDecisions). */
  decisions: PendingDecision[];
  /** The game paused itself for a decision. */
  autoPaused: boolean;
  /** The automatic acceleration runs (the clock goes at its speed instead of `speed`). */
  accelerated: boolean;
}

export interface SessionOptions {
  /** Real seconds per game day at ×1 (content/temps.json; shorter in end-to-end tests). */
  realSecondsPerGameDay?: number;
  /** Read on each new decision: the player may switch the automatic pause off. */
  autoPause?: () => boolean;
  /** Read on each frame: the automatic acceleration (docs/02, 2.3). */
  autoSpeed?: () => boolean;
  /** Told of every accepted action (the game log). */
  onAction?: (action: GameAction, state: GameState) => void;
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
  private readonly autoSpeed: () => boolean;
  private readonly onAction: ((action: GameAction, state: GameState) => void) | undefined;
  /** Engine's pace of the current state: nothing urgent waits for the player. */
  private calm: boolean;
  /** No acceleration before this game hour (quiet hours after a new decision). */
  private quietUntil: number;
  /** Decisions already shown: only new ones pause the game. */
  private seenDecisions: Set<string>;
  /**
   * After an automatic pause: the speed to go back to once the decisions that
   * paused the game are settled. Forgotten as soon as the speed is set otherwise.
   */
  private resume: { speed: number; keys: Set<string> } | null = null;
  /**
   * Scenes open over the game (reviews, celebrations): the clock waits while there is
   * one, whatever the speed. Kept apart from the speed, so that closing a scene never
   * undoes an automatic pause, nor the speed the player chose meanwhile.
   */
  private holds = 0;
  private frame: number | null = null;
  private lastFrameAt: number | null = null;
  private pendingMs = 0;

  constructor(state: GameState, onEvents: EventListener, options: SessionOptions = {}) {
    const decisions = engine.pendingDecisions(state);
    this.snapshot = {
      state,
      speed: options.initialSpeed ?? timeSettings.speeds[0] ?? 1,
      decisions,
      autoPaused: false,
      accelerated: false,
    };
    this.calm = engine.pace(state).calm;
    this.quietUntil = state.clock.elapsedHours;
    this.seenDecisions = new Set(decisions.map(decisionKey));
    this.eventListeners.add(onEvents);
    const seconds = options.realSecondsPerGameDay ?? timeSettings.realSecondsPerGameDay;
    this.msPerHour = (seconds * 1000) / HOURS_PER_DAY;
    this.autoPause = options.autoPause ?? (() => true);
    this.autoSpeed = options.autoSpeed ?? (() => false);
    this.onAction = options.onAction;
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
    this.resume = null;
    this.pendingMs = 0;
    this.quietUntil = this.snapshot.state.clock.elapsedHours;
    this.update({ speed, autoPaused: false, accelerated: false });
  }

  /** A scene opens over the game: the clock waits until it is released. */
  hold(): void {
    this.holds += 1;
  }

  /** A scene closes: the clock goes on at its speed once no scene holds it. */
  release(): void {
    this.holds = Math.max(0, this.holds - 1);
    this.lastFrameAt = null;
  }

  /** A scene holds the clock. */
  get held(): boolean {
    return this.holds > 0;
  }

  /**
   * Speed the clock really runs at: the automatic acceleration lifts any slower speed the
   * player chose (×1, ×2, ×4) while nothing waits for him (progression, step 4).
   */
  private effectiveSpeed(): number {
    const { speed, state } = this.snapshot;
    const fast = gameContent.rhythm.autoSpeed.speed;
    const accelerate =
      speed > 0 &&
      speed < fast &&
      this.autoSpeed() &&
      this.calm &&
      state.clock.elapsedHours >= this.quietUntil;
    if (accelerate !== this.snapshot.accelerated) this.update({ accelerated: accelerate });
    return accelerate ? fast : speed;
  }

  dispatch(action: GameAction): DispatchResult {
    const result = engine.dispatch(this.snapshot.state, action);
    if (result.ok) {
      this.onAction?.(action, result.state);
      this.applyEvents(result.state, result.events, false);
    }
    return result;
  }

  private readonly onFrame = (now: number): void => {
    const elapsed = this.lastFrameAt === null ? 0 : Math.min(now - this.lastFrameAt, MAX_FRAME_MS);
    this.lastFrameAt = now;
    if (this.snapshot.speed > 0 && this.holds === 0) {
      this.pendingMs += elapsed * this.effectiveSpeed();
      let state = this.snapshot.state;
      const events: GameEvent[] = [];
      let hours = 0;
      while (this.pendingMs >= this.msPerHour) {
        if (++hours > MAX_HOURS_PER_FRAME) {
          this.pendingMs = 0;
          break;
        }
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
      this.calm = engine.pace(state).calm;
      // A new decision brings the clock back to ×1 for a few hours.
      if (fresh.length > 0) {
        this.quietUntil = state.clock.elapsedHours + gameContent.rhythm.autoSpeed.quietHours;
        changes.accelerated = false;
      }
      const pausing = fresh.filter((decision) => decision.autoPause).map(decisionKey);
      if (ticking && this.autoPause() && pausing.length > 0) {
        this.pendingMs = 0;
        this.resume = { speed: this.snapshot.speed, keys: new Set(pausing) };
        changes.speed = 0;
        changes.autoPaused = true;
      } else if (this.resume && this.snapshot.autoPaused) {
        // A decision that pauses, come while the game waits, is waited for too.
        for (const key of pausing) this.resume.keys.add(key);
        if (state.player.bankruptDay !== null || state.gameOver !== null) {
          this.resume = null;
        } else if (!decisions.some((decision) => this.resume?.keys.has(decisionKey(decision)))) {
          // Everything that paused the game is settled: the clock goes on at its speed.
          changes.speed = this.resume.speed;
          changes.autoPaused = false;
          this.resume = null;
        }
      }
    }
    this.update(changes);
    if (events.length > 0) for (const listener of this.eventListeners) listener(events, state);
  }

  private update(changes: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) listener();
  }
}
