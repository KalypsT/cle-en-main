import { z } from 'zod';

/** Kinds of decisions the engine lists for the « Décisions » screen. */
export const DECISION_KINDS = [
  'counterOffer',
  'loanNeeded',
  'loanAnswer',
  'deedFunds',
  'candidates',
  'saleOffer',
  'worksHazard',
  'coproVote',
  'incident',
  'quoteExpiring',
  'dpeWarning',
  'vacant',
  'renegotiation',
  'cashAlert',
  'catalogEvent',
  'challengeOffer',
] as const;

/** Rules of the pending decisions and of the cash alert (docs/04, docs/02 section 2.6). */
export const decisionRulesSchema = z
  .object({
    /** A quote is listed this many days before it expires. */
    quoteWarningDays: z.number().int().min(1),
    /** Days of known flows the cash forecast covers (alert when it goes below zero). */
    cashForecastDays: z.number().int().min(1),
    /** Decisions that pause the game when they appear (short deadlines). */
    autoPause: z.array(z.enum(DECISION_KINDS)),
    /** Tenant incidents serious enough to pause the game too (content/location.json). */
    seriousIncidents: z.array(z.string()),
  })
  .strict();

export type DecisionRules = z.infer<typeof decisionRulesSchema>;
export type DecisionKind = (typeof DECISION_KINDS)[number];
