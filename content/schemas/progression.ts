import { z } from 'zod';
import { euros, id } from './common.ts';

/**
 * Measures of a game that titles, achievements, challenges and events can
 * test (docs/02, sections 2.8 to 2.10). Counters are kept by the engine as
 * the game goes; the others are read from the state. Amounts in euros.
 */
export const STATS = [
  // Counters.
  'purchases',
  /** Bought at least `bargainShare` under the player's estimate. */
  'bargainPurchases',
  'homeBought',
  'sales',
  'salesWithGain',
  'worksDone',
  /** Works of at least `bigWorksMinEuros`. */
  'bigWorksDone',
  'dpeClassesGained',
  /** A property renovated from G to B or better. */
  'dpeGToB',
  /** A property renovated from E, F or G to A, B, C or D. */
  'passoiresFixed',
  'leasesSigned',
  'incidentsRepaired',
  /** Works tasks done by the player himself. */
  'diyTasks',
  /** Transformations completed: a house divided, an attic converted, a house built (milestone 8). */
  'transformations',
  'bankMeetings',
  'refinances',
  'loansRepaid',
  'forcedSales',
  'procedures',
  'evictions',
  /** Catalogue events the player answered himself (not by default). */
  'eventChoices',
  'anecdotes',
  'challengesWon',
  /** Compromis signed on a listing a rival wanted; `key`: the rival. */
  'rivalBeaten',
  /** Current run of months with a positive monthly statement. */
  'positiveStreak',
  'bestPositiveStreak',
  /** Yearly assessments with rents and no tax on them. */
  'rentTaxFreeYears',
  /** Years with properties and no forced sale, procedure, eviction nor indecent let. */
  'quietYears',
  'freshStarts',
  'rewinds',
  // Read from the state.
  'netWorth',
  'balance',
  'debt',
  'properties',
  /** Homes let (flats, houses, buildings), shops and parking spaces aside. */
  'letProperties',
  /** Owned properties classed E, F or G. */
  'passoires',
  'cities',
  'reputation',
  /** Rents of the current leases, charges excluded. */
  'monthlyRent',
  /** A banker's trust; `key`: the bank. */
  'bankTrust',
  'yearsPlayed',
] as const;

export type Stat = (typeof STATS)[number];

/** Stats that take a `key` (a bank or a rival). */
export const KEYED_STATS: readonly Stat[] = ['rivalBeaten', 'bankTrust'];

export const statConditionSchema = z
  .object({
    stat: z.enum(STATS),
    key: id.optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    /** False: written for a later milestone, ignored until then (the cities of milestone 7). */
    active: z.boolean().optional(),
  })
  .strict()
  .refine((c) => c.min !== undefined || c.max !== undefined, 'min ou max attendu')
  .refine((c) => KEYED_STATS.includes(c.stat) === (c.key !== undefined), 'clé attendue ou en trop');

export type StatCondition = z.infer<typeof statConditionSchema>;

const unique = <T extends { id: string }>(items: T[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

/** A title (docs/02, section 2.9). */
export const titleSchema = z
  .object({
    id,
    name: z.string().min(1),
    /** Step 0 is the starting title. */
    step: z.number().int().min(0),
    branch: z.enum(['both', 'landlord', 'dealer']),
    description: z.string().min(1),
    /** Every condition must hold. */
    conditions: z.array(statConditionSchema),
    /** At least one of these titles must be held first. */
    requiresAny: z.array(id),
    /** False: arrives with a later milestone (Promoteur, milestone 8). */
    available: z.boolean(),
    perks: z
      .object({
        /** Added to every bank's margin (negative: cheaper loans). */
        bankMarginPercent: z.number().max(0).optional(),
        /** Extra monthly chance that an agent offers an off-market property. */
        offMarketChancePerMonth: z.number().min(0).max(1).optional(),
      })
      .strict(),
    /** What the perk does, for the player. */
    perkText: z.string().min(1).nullable(),
  })
  .strict();

export const titlesFileSchema = z
  .object({ titles: z.array(titleSchema).min(1).refine(unique, 'Titre en double') })
  .strict();

export const achievementSchema = z
  .object({
    id,
    name: z.string().min(1),
    description: z.string().min(1),
    conditions: z.array(statConditionSchema).min(1),
    /** Hidden until earned. */
    secret: z.boolean().optional(),
  })
  .strict();

export const achievementsFileSchema = z
  .object({ achievements: z.array(achievementSchema).min(1).refine(unique, 'Succès en double') })
  .strict();

/** Characters who launch challenges. */
export const CHALLENGE_GIVERS = [
  'gerard',
  'kevin',
  'hortense',
  'yvon',
  'monique',
  'martinot',
] as const;

export const challengeSchema = z
  .object({
    id,
    giver: z.enum(CHALLENGE_GIVERS),
    /** Offered only when these hold. */
    conditions: z.array(statConditionSchema),
    /** Months the challenge can be offered in (all when absent). */
    months: z.array(z.number().int().min(1).max(12)).optional(),
    /** `gain`: the stat must grow by this much; `min` / `max`: it must reach it. */
    goal: z
      .object({
        stat: z.enum(STATS),
        key: id.optional(),
        gain: z.number().positive().optional(),
        min: z.number().optional(),
      })
      .strict()
      .refine((g) => (g.gain === undefined) !== (g.min === undefined), 'gain ou min'),
    /** Days to succeed, or the end of the year plus this many days (`untilYearEnd`). */
    days: z.number().int().positive(),
    untilYearEnd: z.boolean().optional(),
    rewardReputation: z.number().int().min(0),
    penaltyReputation: z.number().int().max(0),
    text: z.string().min(1),
    success: z.string().min(1),
    failure: z.string().min(1),
  })
  .strict();

export const challengesFileSchema = z
  .object({
    /** Daily chance of an offer once the gap has passed (2 to 3 a year). */
    chancePerDay: z.number().min(0).max(1),
    /** Days between the end of a challenge (or its offer) and the next offer. */
    minGapDays: z.number().int().min(0),
    /** Days the player has to accept. */
    answerDays: z.number().int().min(1),
    givers: z.record(z.enum(CHALLENGE_GIVERS), z.string().min(1)),
    challenges: z.array(challengeSchema).min(1).refine(unique, 'Défi en double'),
  })
  .strict();

const delta = z.number().int();

/** Reputation, records and chronicle (content/progression.json). */
export const progressionRulesSchema = z
  .object({
    /** Works of at least this cost count as a renovation (Rénovateur). */
    bigWorksMinEuros: euros,
    /** A purchase this far under the player's estimate is a bargain. */
    bargainShare: z.number().min(0).max(1),
    reputation: z
      .object({
        purchase: delta,
        saleWithGain: delta,
        worksDone: delta,
        dpeClassGained: delta,
        /** At the yearly review, with properties and no trouble during the year. */
        quietYear: delta,
        /** At each lease anniversary, when the tenant is this satisfied. */
        happyTenant: delta,
        happyTenantMin: z.number().min(0).max(100),
        challengeWon: delta.optional(),
        forcedSale: delta,
        procedure: delta,
        eviction: delta,
        /** The tenant leaves because of an incident left unrepaired. */
        tenantConflict: delta,
        /** Yearly, for each let property that is not decent. */
        indecentLet: delta,
        /**
         * Gains made from this reputation on are scaled by (100 − reputation) / span: the last
         * points are the hardest (milestone 8, open point 14).
         */
        diminishingFrom: z.number().min(0).max(100),
        diminishingSpan: z.number().positive(),
        /** At the yearly review, a reputation above this loses `erosionPerYear` (not below it). */
        erosionAbove: z.number().min(0).max(100),
        erosionPerYear: z.number().min(0),
      })
      .strict(),
    effects: z
      .object({
        /** Margin added to every loan from these reputations on (the best one applies). */
        bankMargin: z.array(
          z
            .object({ minReputation: z.number().min(0).max(100), percent: z.number().max(0) })
            .strict(),
        ),
        /** Agents offer off-market properties from this reputation on. */
        offMarketFromReputation: z.number().min(0).max(100),
        offMarketChancePerMonth: z.number().min(0).max(1),
        /** Days the player alone sees an off-market listing. */
        offMarketExclusiveDays: z.number().int().min(1),
        /** Seller motivation of an off-market listing (content/marche.json). */
        offMarketMotivationId: id,
      })
      .strict(),
    /** Chronicle entries kept (the oldest go first, the major ones stay). */
    chronicleLength: z.number().int().min(10),
  })
  .strict();

export type Title = z.infer<typeof titleSchema>;
export type Achievement = z.infer<typeof achievementSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type ChallengesFile = z.infer<typeof challengesFileSchema>;
export type ChallengeGiver = (typeof CHALLENGE_GIVERS)[number];
export type ProgressionRules = z.infer<typeof progressionRulesSchema>;

/** What Yvon Tableur can advise at the yearly review (chosen by the engine). */
export const ADVICE_KINDS = [
  'netWorthUp',
  'netWorthDown',
  'goodYear',
  'badYear',
  'taxFree',
  'bigTax',
  'betterRegime',
  'autoRegime',
  'deficitCarry',
  'dpeBan',
  'vacancy',
  'lowReserve',
  'highDebt',
  'renegotiate',
  'noProperty',
  'firstYear',
  /** A let property that costs money every month (progression, step 3). */
  'negativeCashFlow',
] as const;

export type AdviceKind = (typeof ADVICE_KINDS)[number];

/** Yvon Tableur's words at the yearly review (content/textes/yvon.json). */
export const yvonTextsSchema = z
  .object({
    greetings: z.array(z.string().min(1)).min(1),
    closings: z.array(z.string().min(1)).min(1),
    /** Variants of each piece of advice; variables depend on the advice. */
    advice: z.record(z.enum(ADVICE_KINDS), z.array(z.string().min(1)).min(1)),
    /** Advice shown at most. */
    maxAdvice: z.number().int().min(1),
    /** Thresholds of the advice. */
    thresholds: z
      .object({
        bigTaxEuros: euros,
        reserveMonths: z.number().min(0),
        highDebtRatio: z.number().min(0).max(1),
        dpeBanYears: z.number().int().min(1),
        regimeSavingEuros: euros,
        renegotiatePoints: z.number().min(0),
        /** Monthly cash flow within ± this amount: « balanced » (progression, step 3). */
        cashFlowEuros: euros,
        /** Loan length of the cash-flow outlook shown on a listing, with the account bank. */
        outlookYears: z.number().int().min(1),
      })
      .strict(),
  })
  .strict();

export type YvonTexts = z.infer<typeof yvonTextsSchema>;
