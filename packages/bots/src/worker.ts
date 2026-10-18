import { parentPort } from 'node:worker_threads';
import { type GameTask, runTask } from './series.ts';

// One game per message; the parent sends the next one when this one is done.
parentPort?.on('message', (task: GameTask) => {
  parentPort?.postMessage(runTask(task));
});
