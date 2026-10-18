import { z } from 'zod';
import { euros, id, share } from './common.ts';

/** Starting conditions of every new game (docs/02, section 2.1). */
export const startSchema = z
  .object({
    savings: euros,
    cityId: id,
    monthlyRent: euros,
    reputation: z.number().min(0).max(100),
    /** Job preselected on the game creation screen (and used by bots and tests). */
    defaultJobId: id,
    /** Name of a player who leaves the field empty, and of saves older than version 7. */
    defaultPlayerName: z.string().min(1),
    maxPlayerNameLength: z.number().int().min(1),
    /** Bank holding the current account. */
    accountBankId: id,
  })
  .strict();

/**
 * Monthly living costs, rent excluded. They follow the income so that salary
 * savings stay small: the player gets richer by investing, not by waiting.
 */
export const livingCostsSchema = z
  .object({
    referenceIncome: euros,
    costAtReferenceIncome: euros,
    /** Extra living costs per extra euro of income (and savings per euro lost). */
    shareOfIncomeDifference: share,
    minimum: euros,
  })
  .strict();

export type Start = z.infer<typeof startSchema>;
export type LivingCosts = z.infer<typeof livingCostsSchema>;
