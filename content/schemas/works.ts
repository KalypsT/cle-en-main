import { z } from 'zod';
import { DPE_LABELS, EPOCHS } from './city.ts';
import { euros, id, share } from './common.ts';

/** Works and co-ownership (docs/03-systemes/05-travaux-et-copropriete.md). */

export const TIERS = ['eco', 'standard', 'premium'] as const;
export const SPACE_KINDS = [
  'entry',
  'living',
  'kitchen',
  'bedroom',
  'bathroom',
  'wc',
  'garden',
] as const;
export const ITEM_KINDS = [
  'floors',
  'walls',
  'joinery',
  'kitchen',
  'bathroom',
  'wcUnit',
  'garden',
  'electricity',
  'plumbing',
  'heating',
  'insulation',
  'windows',
  'ventilation',
  'roof',
  'facade',
  'commonParts',
] as const;
export const TRADES = [
  'plumber',
  'electrician',
  'mason',
  'painter',
  'tiler',
  'carpenter',
  'heatingEngineer',
  'kitchenFitter',
] as const;
/**
 * What the cost of an item is proportional to: the room's floor area, the
 * dwelling's area, its insulated walls, its windows, one unit per dwelling,
 * its roof or its façade (areas derived from the living area, see `areas`).
 */
export const COST_BASES = [
  'space',
  'surface',
  'insulation',
  'windows',
  'unit',
  'roof',
  'facade',
] as const;
const PROPERTY_KINDS = ['apartment', 'house', 'building'] as const;

export const tierSchema = z.enum(TIERS);
export const itemKindSchema = z.enum(ITEM_KINDS);
export const tradeSchema = z.enum(TRADES);
const positive = z.number().positive();
const range = z
  .object({ min: z.number(), max: z.number() })
  .strict()
  .refine((r) => r.max >= r.min, { message: 'max doit être supérieur ou égal à min.' });
/** Five values, for states 1 (to redo entirely) to 5 (new). */
const byState = z.array(z.number()).length(5);
const amount = z.object({ fixed: z.number().min(0), perUnit: z.number().min(0) }).strict();

const tierCostSchema = z
  .object({
    /** Reference price, TTC, before the city index, the item's state and the artisan. */
    cost: amount,
    /** Calendar days of an artisan's work. */
    days: amount,
  })
  .strict();

const itemSchema = z
  .object({
    /** One per room (`space`), one for the dwelling, or the building's common parts (`copro`). */
    scope: z.enum(['space', 'dwelling', 'copro']),
    /** Dwelling items exist only for these kinds of property. */
    kinds: z.array(z.enum(PROPERTY_KINDS)).min(1),
    /** Weight in the value and rent of the property (relative). */
    valueWeight: z.number().min(0),
    /** Chance that a visit shows its state (1: plain to see). */
    revealOnVisit: share,
    /** Generation: added to the mean state of the listing's condition. */
    generationOffset: z.number(),
    /** At state 1 the dwelling is indecent and cannot be let. */
    critical: z.boolean(),
    /** Multiplier on the yearly wear. */
    wearFactor: z.number().min(0),
    /** Energy model (DPE): multiplier by state, and by tier. */
    energy: z
      .object({ byState, tiers: z.record(tierSchema, positive) })
      .strict()
      .nullable(),
    /** How the player can renovate it; null: only the co-ownership can. */
    works: z
      .object({
        trade: tradeSchema,
        /** Order on the schedule: a phase starts when the previous ones are done. */
        phase: z.number().int().min(1).max(9),
        basis: z.enum(COST_BASES),
        tiers: z.record(tierSchema, tierCostSchema),
        /** Share of the price that is labour (saved when doing it oneself). */
        labourShare: share,
        /** Possible with a tenant in place (small works). */
        occupied: z.boolean(),
        /** Doing it oneself; `jobs` null means anyone may. */
        diy: z
          .object({
            jobs: z.array(id).nullable(),
            /** Minutes of free time: fixed plus per unit of the cost basis (standard tier). */
            minutes: amount,
            /** Chance of ending at state 5, 4 or 3. */
            quality: z.object({ 5: share, 4: share, 3: share }).strict(),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const hazardSchema = z
  .object({
    id,
    /** Items whose works can reveal it. */
    items: z.array(itemKindSchema).min(1),
    /** Chance when an item starts being worked on, before the epoch multiplier. */
    probability: share,
    epochMultipliers: z.record(z.enum(EPOCHS), z.number().min(0)),
    /** Only on items in this state or worse. */
    maxState: z.number().int().min(1).max(5),
    /** Only if another item is in this state or worse and not part of the works. */
    requires: z
      .object({ item: itemKindSchema, maxState: z.number().int().min(1).max(5) })
      .strict()
      .optional(),
    /** Extra cost: fixed plus per unit of the item's cost basis (a range, drawn). */
    fixedCost: range,
    costPerUnit: range,
    days: range,
  })
  .strict();

const resolutionSchema = z
  .object({
    id,
    weight: z.number().min(0),
    /** The player's share of the cost, per m² of his lot. */
    costPerM2: range,
    /** The call for funds is spread over this many months. */
    months: z.number().int().min(1),
    /** Share of the other owners' votes in favour (drawn). */
    support: range,
    /** State gained by the common parts when it is voted. */
    commonParts: z.number().int().min(0).max(4),
    /** Multiplier on the energy needs when it is voted (1: none). */
    energy: positive,
  })
  .strict();

export const worksRulesSchema = z
  .object({
    items: z.record(itemKindSchema, itemSchema),
    /** Rooms of a dwelling: the items of each kind of room. */
    spaces: z.record(z.enum(SPACE_KINDS), z.array(itemKindSchema).min(1)),
    /** How a living area is split into rooms (share of the area, bounds in m²). */
    layout: z
      .object({
        entry: z.object({ share, min: positive, max: positive }).strict(),
        kitchen: z.object({ share, min: positive, max: positive }).strict(),
        bathroom: z.object({ share, min: positive, max: positive }).strict(),
        bedroom: z.object({ share, min: positive, max: positive }).strict(),
        /** A separate WC from this living area. */
        wc: z.object({ surface: positive, fromSurface: positive }).strict(),
        livingMinShare: share,
        /** A house's garden, in m² per m² of living area. */
        gardenPerM2: positive,
      })
      .strict(),
    /** Quantities of the cost bases, per m² of living area. */
    areas: z
      .object({
        insulation: z.record(z.enum(PROPERTY_KINDS), positive),
        roof: z.record(z.enum(PROPERTY_KINDS), positive),
        facade: z.record(z.enum(PROPERTY_KINDS), positive),
        windowsPerM2: positive,
        minWindows: z.number().int().min(1),
      })
      .strict(),
    /** Price index of each city's artisans (1 = national average). */
    cityCostIndex: z.record(z.string(), positive),
    /** Price multiplier by the item's state before works (state 1 needs more preparation). */
    stateCostFactors: byState,
    tiers: z.record(
      tierSchema,
      z
        .object({
          /** Share of value gained (or lost) on renovated items, within the neighbourhood ceiling. */
          value: z.number(),
          rent: z.number(),
          /** Yearly chance that a renovated item loses one state. */
          wear: share,
          /** Multiplier on the free time of doing it oneself. */
          diyTime: positive,
        })
        .strict(),
    ),
    /** Value of the dwelling by its (weighted) state, interpolated between states 1 and 5. */
    valueByState: byState,
    /** Price quantile of the neighbourhood that tier bonuses cannot push the value beyond. */
    valueCeiling: z.enum(['median', 'q3', 'p90']),
    /** Wear stops at this state: below it, items only degrade with hazards. */
    wearFloorState: z.number().int().min(1).max(5),
    energy: z
      .object({
        /** Primary energy (kWh/m²/year) by epoch, with every energy item at state 3. */
        baseByEpoch: z.record(z.enum(EPOCHS), positive),
        /** Upper bound of each class, in kWh/m²/year (G: highest drawn). */
        classMax: z.record(z.enum(DPE_LABELS), positive),
        /** Generation: added to the state of energy items, by DPE drawn from the data. */
        generationOffsets: z.record(z.enum(DPE_LABELS), z.number()),
      })
      .strict(),
    quotes: z
      .object({
        minutes: z.number().int().min(0),
        validityDays: z.number().int().min(1),
        /** Standard deviation of a quote around the artisan's price. */
        noise: share,
        /** Paid when the works start, the rest at the end of each artisan's task. */
        depositShare: share,
      })
      .strict(),
    /** A craftsman's diagnosis during a purchase: reveals the items of his trade. */
    diagnosis: z.object({ cost: euros }).strict(),
    artisans: z
      .object({
        /** Overrun of the bill and of the delay, times (1 − reliability), drawn up to these. */
        maxOverrun: share,
        maxDelay: z.number().min(0),
        /** Chance that an item ends at state 4 instead of 5, times (1 − reliability). */
        imperfection: share,
        discountPerJob: share,
        maxDiscount: share,
        /** Share of the waiting list skipped per job done together, and per reputation point. */
        queueCutPerJob: share,
        queueCutPerReputation: share,
        maxQueueCut: share,
      })
      .strict(),
    hazards: z.array(hazardSchema),
    /** Days to answer a hazard before it is treated by default. */
    hazardDecisionDays: z.number().int().min(0),
    /** Tenant satisfaction lost per day of works in an occupied home. */
    occupiedSatisfactionPerDay: z.number().min(0),
    /** Daily cap on free time spent doing works oneself. */
    diyDailyMaxMinutes: z.number().int().min(1),
    copro: z
      .object({
        lots: z.object({ min: z.number().int().min(2), max: z.number().int().min(2) }).strict(),
        /** Days between the call to the general meeting and the vote. */
        noticeDays: z.number().int().min(1),
        /** Free time to attend the meeting. */
        attendMinutes: z.number().int().min(0),
        resolutionsPerMeeting: z
          .object({ min: z.number().int().min(0), max: z.number().int().min(1) })
          .strict(),
        resolutions: z.array(resolutionSchema).min(1),
      })
      .strict(),
  })
  .strict();

const artisanSchema = z
  .object({
    id,
    name: z.string().min(1),
    trade: tradeSchema,
    cities: z.array(id).min(1),
    /** Multiplier on the reference price. */
    priceFactor: positive,
    /** Keeps to the quote, the schedule and the quality, 0 … 1. */
    reliability: share,
    /** Waiting list before he can start, in days. */
    queueDays: range,
    personality: z.string().min(1),
    /** In the address book once this many works were completed in the city (0: from the start). */
    unlockAfterWorks: z.number().int().min(0),
  })
  .strict();

export const artisansFileSchema = z
  .object({
    trades: z.record(tradeSchema, z.string().min(1)),
    artisans: z.array(artisanSchema).min(1),
  })
  .strict();

/** Texts of the works: items, rooms, tiers, hazards and general meetings. */
export const worksTextsSchema = z
  .object({
    items: z.record(itemKindSchema, z.string().min(1)),
    spaces: z.record(z.enum(SPACE_KINDS), z.string().min(1)),
    tiers: z.record(tierSchema, z.string().min(1)),
    states: z.array(z.string().min(1)).length(5),
    hazards: z.record(id, z.string().min(1)),
    /** Shown when a visit reveals an item at state 1. */
    poorStateHints: z.partialRecord(itemKindSchema, z.string().min(1)),
    resolutions: z.record(id, z.string().min(1)),
    /** Humorous verdicts of the general meeting. */
    meetingPassed: z.array(z.string().min(1)).min(1),
    meetingRejected: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type Tier = z.infer<typeof tierSchema>;
export type ItemKind = z.infer<typeof itemKindSchema>;
export type SpaceKind = (typeof SPACE_KINDS)[number];
export type Trade = z.infer<typeof tradeSchema>;
export type WorksRules = z.infer<typeof worksRulesSchema>;
export type ItemRule = z.infer<typeof itemSchema>;
export type HazardRule = z.infer<typeof hazardSchema>;
export type ResolutionRule = z.infer<typeof resolutionSchema>;
export type Artisan = z.infer<typeof artisanSchema>;
export type ArtisansFile = z.infer<typeof artisansFileSchema>;
export type WorksTexts = z.infer<typeof worksTextsSchema>;
