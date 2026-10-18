import type { Bank, GameContent, Job } from '@cle/content';

export type { Bank, GameContent, Job };

export function findJob(content: GameContent, jobId: string): Job {
  const job = content.jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new RangeError(`Unknown job ${jobId}`);
  return job;
}

export function findBank(content: GameContent, bankId: string): Bank | undefined {
  return content.banks.find((candidate) => candidate.id === bankId);
}
