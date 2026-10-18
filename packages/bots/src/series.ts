import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { jobs } from '@cle/content';
import type { CalendarDate } from '@cle/engine';
import { playGame } from './driver.ts';
import type { GameMetrics } from './metrics.ts';
import { type BotId, createStrategy } from './strategies.ts';

export interface SeriesOptions {
  bots: readonly BotId[];
  games: number;
  years: number;
  firstSeed: number;
  startDate: CalendarDate;
  startHour: number;
  /** Fixed job, or every job in turn (game i plays jobs[i mod 7]). */
  jobId: string | null;
  workers: number;
}

export interface GameTask {
  botId: BotId;
  seed: number;
  jobId: string;
  startDate: CalendarDate;
  startHour: number;
  days: number;
}

const DAYS_PER_YEAR = 365;

/** Every game of a series. The same seeds and jobs for every bot, so bots compare pairwise. */
export function seriesTasks(options: SeriesOptions): GameTask[] {
  const tasks: GameTask[] = [];
  for (let i = 0; i < options.games; i++) {
    const jobId = options.jobId ?? jobs[i % jobs.length]?.id ?? jobs[0]?.id ?? '';
    for (const botId of options.bots) {
      tasks.push({
        botId,
        seed: options.firstSeed + i,
        jobId,
        startDate: options.startDate,
        startHour: options.startHour,
        days: Math.round(options.years * DAYS_PER_YEAR),
      });
    }
  }
  return tasks;
}

export function runTask(task: GameTask): GameMetrics {
  return playGame(createStrategy(task.botId), task);
}

export function defaultWorkers(): number {
  return Math.max(1, availableParallelism());
}

/**
 * Plays the tasks on `workers` threads (in this thread when 1). Results come
 * back in task order whatever the number of workers: a series is reproducible.
 */
export async function runTasks(
  tasks: GameTask[],
  workers: number,
  onProgress?: (done: number, total: number) => void,
): Promise<GameMetrics[]> {
  const results = new Array<GameMetrics>(tasks.length);
  if (workers <= 1) {
    tasks.forEach((task, i) => {
      results[i] = runTask(task);
      onProgress?.(i + 1, tasks.length);
    });
    return results;
  }
  let next = 0;
  let done = 0;
  const workerUrl = new URL('./worker.ts', import.meta.url);
  await Promise.all(
    Array.from({ length: Math.min(workers, tasks.length) }, async () => {
      const worker = new Worker(workerUrl, { execArgv: ['--import', 'tsx'] });
      try {
        while (next < tasks.length) {
          const index = next++;
          results[index] = await new Promise<GameMetrics>((resolve, reject) => {
            worker.once('message', resolve);
            worker.once('error', reject);
            worker.postMessage(tasks[index]);
          });
          worker.removeAllListeners('error');
          done += 1;
          onProgress?.(done, tasks.length);
        }
      } finally {
        await worker.terminate();
      }
    }),
  );
  return results;
}
