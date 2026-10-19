import { gameContent } from '@cle/content';
import {
  type CalendarDate,
  createEngine,
  type Engine,
  type GameAction,
  type GameEvent,
  type GameState,
  HOURS_PER_DAY,
  nextFloat,
  type RngState,
  seedRng,
  toDayNumber,
} from '@cle/engine';
import { MetricsRecorder, type GameMetrics } from './metrics.ts';

export const engine = createEngine(gameContent);

/** What a strategy sees and can do. Bots play only through `act`, like the interface. */
export class BotApi {
  readonly engine: Engine = engine;
  state: GameState;
  /** The bot's own random generator, separate from the world's. */
  private readonly rng: RngState;
  private readonly queue: GameEvent[] = [];
  private readonly onEvents: (events: GameEvent[], state: GameState) => void;

  constructor(
    state: GameState,
    seed: number,
    onEvents: (events: GameEvent[], state: GameState) => void,
  ) {
    this.state = state;
    this.onEvents = onEvents;
    this.rng = seedRng((seed ^ 0x5bd1e995) >>> 0);
  }

  get today(): number {
    return toDayNumber(this.state.clock.date);
  }

  random(): number {
    return nextFloat(this.rng);
  }

  /** Dispatches an action; its events reach the strategy after the current one. */
  act(action: GameAction): boolean {
    const result = engine.dispatch(this.state, action);
    if (!result.ok) return false;
    this.state = result.state;
    this.onEvents(result.events, this.state);
    this.queue.push(...result.events);
    return true;
  }

  /** @internal */
  takeQueued(): GameEvent[] {
    return this.queue.splice(0, this.queue.length);
  }
}

export interface Strategy {
  id: string;
  /** Reaction to each engine event (financing a compromis, answering a counter-offer…). */
  onEvent?(api: BotApi, event: GameEvent): void;
  /** Daily decisions, once a day at the decision hour. */
  daily?(api: BotApi): void;
}

export interface GameOptions {
  seed: number;
  startDate: CalendarDate;
  startHour: number;
  days: number;
  jobId: string;
  /** Hour of the daily decisions (after work). */
  decisionHour?: number;
}

const DEFAULT_DECISION_HOUR = 18;

/**
 * What every bot does with the decisions its strategy ignores, as a player
 * would: it answers the catalogue's events with their default choice right
 * away and takes up the challenges (they cost nothing).
 */
function answerTheRest(api: BotApi): void {
  for (const instance of [...api.state.catalog.pending]) {
    const event = engine.content.events.find((candidate) => candidate.id === instance.eventId);
    if (event?.defaultChoice) {
      api.act({ type: 'event/choose', eventId: instance.id, choiceId: event.defaultChoice });
    }
  }
  const challenge = api.state.progress.challenge;
  if (challenge && !challenge.accepted) api.act({ type: 'challenge/answer', accept: true });
}

/** Plays one game with a strategy and returns its measures. Stops at bankruptcy. */
export function playGame(strategy: Strategy, options: GameOptions): GameMetrics {
  const state = engine.createGame({
    seed: options.seed,
    startDate: options.startDate,
    startHour: options.startHour,
    jobId: options.jobId,
  });
  const metrics = new MetricsRecorder(engine, state, strategy.id, options);
  const api = new BotApi(state, options.seed, (events, current) => metrics.record(events, current));
  const decisionHour = options.decisionHour ?? DEFAULT_DECISION_HOUR;
  const react = (events: GameEvent[]) => {
    let pending = events;
    while (pending.length > 0) {
      for (const event of pending) strategy.onEvent?.(api, event);
      pending = api.takeQueued();
    }
  };
  const ticks = options.days * HOURS_PER_DAY;
  // Real time of each day, with the pace left once the day's decisions are taken.
  let calm = engine.pace(api.state).calm;
  for (let i = 0; i < ticks; i++) {
    const result = engine.tick(api.state);
    api.state = result.state;
    if (result.events.some((event) => event.type === 'dayStarted'))
      metrics.addTime(HOURS_PER_DAY, calm);
    metrics.record(result.events, api.state);
    if (result.events.some((event) => event.type === 'dayStarted')) {
      metrics.observeDecisions(api.state);
      calm = engine.pace(api.state).calm;
    }
    react(result.events);
    // The first bankruptcy ends the measured game (a fresh start would follow).
    if (metrics.bankrupt) break;
    if (api.state.clock.hour === decisionHour && strategy.daily) {
      strategy.daily(api);
      if (strategy.id !== 'inactif') answerTheRest(api);
      react(api.takeQueued());
      metrics.observeDecisions(api.state);
      calm = engine.pace(api.state).calm;
    }
  }
  return metrics.finish(api.state);
}
