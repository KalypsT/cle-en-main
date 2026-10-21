import { z } from 'zod';
import { dpeLabelSchema } from './city.ts';
import { id } from './common.ts';
import { DECISION_KINDS } from './decisions.ts';
import { statConditionSchema } from './progression.ts';
import { leaseTypeSchema } from './renting.ts';
import { propertyKindSchema } from './market.ts';
import { ITEM_KINDS, TRADES } from './works.ts';

/** Families of the catalogue (docs/03-systemes/07, « Les familles d'événements »). */
export const EVENT_FAMILIES = [
  'market',
  'tenants',
  'artisans',
  'bank',
  'copro',
  'city',
  'france',
  /** The player's own life: bonuses, a side job, an inheritance (progression, step 2). */
  'life',
] as const;

/**
 * What an event is about: nothing in particular, a let property (its lease
 * and tenant), any owned property, an owned property without tenant, an
 * owned apartment in a co-ownership, or a property under works.
 */
export const EVENT_TARGETS = ['none', 'lease', 'owned', 'vacant', 'copro', 'works'] as const;

const range = z.object({ min: z.number(), max: z.number() }).strict();

/**
 * Closed vocabulary of conditions (docs/10, point 8). Game-wide ones first,
 * then those on the target property.
 */
export const eventConditionsSchema = z
  .object({
    months: z.array(z.number().int().min(1).max(12)).optional(),
    jobs: z.array(id).optional(),
    employed: z.boolean().optional(),
    /** The player rents his home (true) or owns it (false). */
    renting: z.boolean().optional(),
    hasLoan: z.boolean().optional(),
    stats: z.array(statConditionSchema).optional(),
    // Target.
    item: z
      .object({ kind: z.enum(ITEM_KINDS), maxState: z.number().int().min(1).max(5) })
      .strict()
      .optional(),
    leaseType: leaseTypeSchema.optional(),
    dpe: z.array(dpeLabelSchema).optional(),
    propertyKinds: z.array(propertyKindSchema).optional(),
    satisfaction: range.optional(),
  })
  .strict();

/** What a lasting national crisis acts upon. */
export const CRISIS_MODIFIERS = [
  'unpaidRents',
  'worksCosts',
  'tenantDemand',
  'buyerDemand',
  'credit',
] as const;

export type CrisisModifier = (typeof CRISIS_MODIFIERS)[number];

/** Closed vocabulary of effects. Money and deltas are signed: negative costs. */
export const eventEffectSchema = z.discriminatedUnion('type', [
  /** Euros drawn in a range when the event fires. */
  z.object({ type: z.literal('money'), euros: range }).strict(),
  /** A share of the target's monthly rent (a rebate: negative). */
  z.object({ type: z.literal('rentMoney'), share: z.number() }).strict(),
  z.object({ type: z.literal('reputation'), delta: z.number().int() }).strict(),
  z.object({ type: z.literal('satisfaction'), delta: z.number().int() }).strict(),
  /** A banker's trust: the account bank when `bankId` is absent. */
  z.object({ type: z.literal('trust'), bankId: id.optional(), delta: z.number().int() }).strict(),
  /** The worst item of this kind on the target property gains or loses states, or is set. */
  z
    .object({
      type: z.literal('item'),
      item: z.enum(ITEM_KINDS),
      delta: z.number().int().optional(),
      set: z.number().int().min(1).max(5).optional(),
    })
    .strict(),
  /** Free time spent today (the choice needs it). */
  z.object({ type: z.literal('freeTime'), minutes: z.number().int().min(0) }).strict(),
  /** The tenant gives notice. */
  z.object({ type: z.literal('tenantNotice') }).strict(),
  /** The tenant's rent changes by this share (a rebate, an agreed rise). */
  z.object({ type: z.literal('rent'), share: z.number().min(-0.5).max(0.5) }).strict(),
  /** Price level of the target's neighbourhood or of the whole city (all cities for `france`). */
  z
    .object({
      type: z.literal('priceIndex'),
      scope: z.enum(['neighbourhood', 'city', 'france']),
      percent: z.number(),
    })
    .strict(),
  /** Yearly price trend of a neighbourhood, a city or every city. */
  z
    .object({
      type: z.literal('priceTrend'),
      scope: z.enum(['neighbourhood', 'city', 'france']),
      percent: z.number(),
    })
    .strict(),
  /** The market reference rate moves (it reverts slowly afterwards). */
  z.object({ type: z.literal('marketRate'), delta: z.number() }).strict(),
  /** An agent offers a property off the market. */
  z.object({ type: z.literal('offMarketListing') }).strict(),
  /** The running works of the target finish later (or sooner). */
  z.object({ type: z.literal('worksDelay'), days: z.number().int() }).strict(),
  /**
   * A national crisis that lasts (milestone 8): for `months`, a factor on unpaid rents, the
   * artisans' prices, the candidates for a let, the buyers, or the banks' limits.
   */
  z
    .object({
      type: z.literal('crisis'),
      modifier: z.enum(CRISIS_MODIFIERS),
      factor: z.number().positive(),
      months: z.number().int().min(1),
    })
    .strict(),
]);

export const eventChoiceSchema = z
  .object({
    id,
    label: z.string().min(1),
    effects: z.array(eventEffectSchema),
    /** Text shown once chosen (the outcome). */
    outcome: z.string().min(1).optional(),
  })
  .strict();

export const catalogEventSchema = z
  .object({
    id,
    family: z.enum(EVENT_FAMILIES),
    target: z.enum(EVENT_TARGETS),
    /** `mishap`: scaled by the mode's incident factor; `opportunity`, `neutral`: not. */
    kind: z.enum(['mishap', 'opportunity', 'neutral']),
    conditions: eventConditionsSchema,
    /** Chance per month, for each eligible target (or once when the target is `none`). */
    chancePerMonth: z.number().min(0).max(1),
    /** Days before the same event can come back. */
    cooldownDays: z.number().int().min(0),
    /** The game pauses when it appears. */
    pause: z.boolean(),
    /** A major national event: it goes to the chronicle. */
    major: z.boolean().optional(),
    /** Artisan named in the text (`{artisan}`), drawn from this trade. */
    artisanTrade: z.enum(TRADES).optional(),
    /** Variants; variables: {bien}, {locataire}, {quartier}, {ville}, {artisan}, {banquier}, {rival}, {montant}. */
    texts: z.array(z.string().min(1)).min(1),
    /** No choices: the effects apply at once and the event is only news. */
    effects: z.array(eventEffectSchema).optional(),
    choices: z.array(eventChoiceSchema).optional(),
    /** Days to answer; then the default choice applies. */
    deadlineDays: z.number().int().min(1).optional(),
    defaultChoice: id.optional(),
  })
  .strict()
  .refine(
    (e) =>
      e.choices === undefined
        ? e.effects !== undefined && e.deadlineDays === undefined && e.defaultChoice === undefined
        : e.choices.length >= 2 &&
          e.effects === undefined &&
          e.deadlineDays !== undefined &&
          e.choices.some((choice) => choice.id === e.defaultChoice),
    'Soit des effets immédiats, soit au moins deux choix, une échéance et un choix par défaut',
  );

export const eventsFileSchema = z
  .object({
    events: z
      .array(catalogEventSchema)
      .min(1)
      .refine((events) => new Set(events.map((e) => e.id)).size === events.length, 'Id en double'),
  })
  .strict();

export const ANECDOTE_SPEAKERS = [
  'tenant',
  'artisan',
  'neighbour',
  'rival',
  'banker',
  'city',
] as const;

/** Anecdotes: no stakes, bubbles in the street and news (docs/03-systemes/07). */
export const anecdotesFileSchema = z
  .object({
    anecdotes: z
      .array(
        z
          .object({
            id,
            speaker: z.enum(ANECDOTE_SPEAKERS),
            target: z.enum(['none', 'lease', 'owned', 'works']),
            conditions: eventConditionsSchema,
            weight: z.number().positive(),
            artisanTrade: z.enum(TRADES).optional(),
            texts: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .min(1)
      .refine((items) => new Set(items.map((a) => a.id)).size === items.length, 'Id en double'),
  })
  .strict();

/** Rhythm of the game (content/rythme.json, docs/02 section 2.3 and docs/03-systemes/07). */
export const rhythmRulesSchema = z
  .object({
    autoSpeed: z
      .object({
        /** Speed when nothing waits for the player. */
        speed: z.number().int().positive(),
        /** Game hours at ×1 after any news before speeding up again. */
        quietHours: z.number().int().min(0),
        /** Pending decisions that never hold the acceleration back (lasting states). */
        ignoredDecisions: z.array(z.enum(DECISION_KINDS)),
        /** Other decisions hold it back once their deadline is this close (new ones always slow it down for `quietHours`). */
        urgentDays: z.number().int().min(0),
        /** Planned actions within this many hours hold it back. */
        agendaHorizonHours: z.number().int().min(0),
      })
      .strict(),
    events: z
      .object({
        /** Catalogue events waiting for an answer at the same time, at most. */
        maxPending: z.number().int().min(1),
        /** New catalogue events per day, at most. */
        maxPerDay: z.number().int().min(1),
        /** Daily chance of an anecdote. */
        anecdoteChancePerDay: z.number().min(0).max(1),
        /** Anecdotes kept for the street bubbles, and for how many days. */
        anecdotesKept: z.number().int().min(1),
        anecdoteBubbleDays: z.number().int().min(1),
      })
      .strict(),
    /** News and mail of the « Décisions » tab: how many, and for how many days (docs/04, 4.10). */
    inbox: z
      .object({
        newsKept: z.number().int().min(1),
        newsKeptDays: z.number().int().min(1),
        mailKept: z.number().int().min(1),
        mailKeptDays: z.number().int().min(1),
      })
      .strict(),
    /** Monthly statements kept for the « Bilan du mois » (the yearly reviews are all kept). */
    statementsKept: z.number().int().min(1),
    /** Monthly rewind points kept (docs/02, section 2.7). */
    rewindPoints: z.number().int().min(1),
    /** Entries of the game log kept on the phone. */
    journalEntries: z.number().int().min(100),
  })
  .strict();

export type EventFamily = (typeof EVENT_FAMILIES)[number];
export type EventTarget = (typeof EVENT_TARGETS)[number];
export type EventConditions = z.infer<typeof eventConditionsSchema>;
export type EventEffect = z.infer<typeof eventEffectSchema>;
export type EventChoice = z.infer<typeof eventChoiceSchema>;
export type CatalogEvent = z.infer<typeof catalogEventSchema>;
export type Anecdote = z.infer<typeof anecdotesFileSchema>['anecdotes'][number];
export type RhythmRules = z.infer<typeof rhythmRulesSchema>;
