import { z } from 'zod';
import { conditionSchema } from './market.ts';
import { euros, id, share } from './common.ts';

/** Named rival investors (docs/03-systemes/03, « Les investisseurs rivaux »). */

const range = z
  .object({ min: z.number(), max: z.number() })
  .strict()
  .refine((r) => r.max >= r.min, { message: 'max doit être supérieur ou égal à min.' });

const rivalSchema = z
  .object({
    id,
    name: z.string().min(1),
    strategy: z.string().min(1),
    personality: z.string().min(1),
    /** Inactive rivals are described but do not act yet (SCI Horizon: milestone 8). */
    active: z.boolean(),
    cities: z.array(id).min(1),
    preferences: z
      .object({
        kinds: z.array(z.enum(['apartment', 'house', 'building'])).min(1),
        /** Largest living area considered, in m². */
        maxSurface: z.number().positive(),
        conditions: z.array(conditionSchema).min(1),
        /** Interest by neighbourhood id (0 … 1); absent neighbourhoods use `otherNeighbourhoods`. */
        neighbourhoods: z.record(id, share),
        otherNeighbourhoods: share,
      })
      .strict(),
    budget: z
      .object({
        /** Money available on the first day, in euros. */
        start: euros,
        /** Added on the 1st of each month. */
        monthlyIncome: euros,
        max: euros,
      })
      .strict(),
    /** Standard deviation of the rival's own value estimate (share of the real value). */
    estimationErrorStdDev: share,
    /** Buys when its estimate beats the asking price by at least this share. */
    minBargain: z.number().min(0),
    /** Daily chance of acting on a listing it wants, at aggressiveness 1. */
    dailyReaction: share,
    /** Purchase costs on top of the price (notary), as a share of the price. */
    costShare: share,
    /** Offers on the player's properties for sale. */
    resaleOffers: z
      .object({
        /** Offers when its estimate beats the player's asking price by this share. */
        minBargain: z.number().min(0),
        dailyReaction: share,
        /** Offer as a share of the asking price. */
        offerShare: range,
      })
      .strict(),
    /** Marchands de biens: renovate, then put the property back on the market. */
    flip: z
      .object({
        months: range,
        conditionAfter: conditionSchema,
        /** Motivation of the listing they publish (content/marche.json). */
        motivationId: id,
      })
      .strict()
      .nullable(),
  })
  .strict();

export const rivalsFileSchema = z
  .object({
    /** Rivals grow bolder as the player gets richer. */
    aggressiveness: z
      .object({
        /** Player net worth (euros) per step of extra aggressiveness. */
        netWorthStep: euros,
        perStep: z.number().min(0),
        max: z.number().min(1),
      })
      .strict(),
    rivals: z
      .array(rivalSchema)
      .min(1)
      .refine(
        (rivals) => new Set(rivals.map((r) => r.id)).size === rivals.length,
        'Duplicate rival id',
      ),
  })
  .strict();

export type Rival = z.infer<typeof rivalSchema>;
export type RivalsFile = z.infer<typeof rivalsFileSchema>;
