import { z } from 'zod';
import { DPE_LABELS, EPOCHS } from './city.ts';
import { euros, id, share } from './common.ts';

/** Market and listing rules (docs/03-systemes/03-marche-et-annonces.md). */

export const CONDITIONS = ['ruin', 'toRenovate', 'toRefresh', 'good', 'renovated'] as const;
export const conditionSchema = z.enum(CONDITIONS);

const positive = z.number().positive();
const days = z.number().int().min(0);
const minutes = z.number().int().min(0);
const factorsOf = <const K extends readonly [string, ...string[]]>(keys: K) =>
  z.record(z.enum(keys), positive);
const range = z
  .object({ min: z.number(), max: z.number() })
  .strict()
  .refine((r) => r.max >= r.min, { message: 'max doit être supérieur ou égal à min.' });

const motivationSchema = z
  .object({
    id,
    /** Draw weight of ordinary sellers; 0 for sellers that only rivals create. */
    weight: z.number().min(0),
    /** Asking price = real value × this factor (drawn in the range) × estimation error. */
    priceFactor: range,
    /** Largest discount the seller grants at once, before time on the market. */
    flexibility: share,
  })
  .strict();

const defectSchema = z
  .object({
    id,
    /** Share of the value lost while the defect is there. */
    valueImpactShare: share,
    /** Chance that a property has it (nuisances the works cannot fix). */
    probability: share,
    /** Chance that a visit reveals it. */
    revealChanceOnVisit: share,
    /** Only these kinds of property can have it. */
    kinds: z.array(z.enum(['apartment', 'house', 'building'])).min(1),
    /** Multiplier on the probability by construction epoch (1 when absent). */
    epochMultipliers: z.partialRecord(z.enum(EPOCHS), z.number().min(0)).optional(),
  })
  .strict();

export const marketRulesSchema = z
  .object({
    flow: z
      .object({
        /** Listings published per real sale observed in DVF. */
        listingsPerSale: positive,
        /** Listings on the market at game start, in days of flow. */
        initialStockDays: z.number().min(0),
        /** Share of new listings that are whole buildings (immeubles de rapport). */
        buildingShare: share,
      })
      .strict(),
    apartment: z
      .object({
        maxFloor: z.number().int().min(0),
        /** Value factor by floor (last key applies above). */
        floorFactors: z.record(z.string().regex(/^\d+$/), positive),
      })
      .strict(),
    building: z
      .object({
        lots: range,
        lotSurface: range,
        /** Price of a whole building relative to the sum of its flats. */
        valueFactor: positive,
      })
      .strict(),
    /**
     * Condition announced by the seller: generation draws each item's state
     * around this mean (content/travaux.json), and the label of a dwelling is
     * the condition whose mean is closest to its weighted state.
     */
    conditions: z.record(
      conditionSchema,
      z.object({ meanState: z.number().min(1).max(5) }).strict(),
    ),
    /** Spread of an item's state around the mean of its condition. */
    stateStdDev: z.number().min(0),
    /** Condition weights by construction epoch. */
    conditionWeights: z.record(z.enum(EPOCHS), z.record(conditionSchema, z.number().min(0))),
    dpeFactors: factorsOf(DPE_LABELS),
    epochFactors: factorsOf(EPOCHS),
    defects: z.array(defectSchema),
    pricing: z
      .object({
        /** Standard deviation of the seller's estimation error (share of value). */
        errorStdDev: share,
        errorMax: share,
        /** Asking prices are rounded to this many euros. */
        rounding: z.number().int().positive(),
        /** Half-width of the range shown around an estimate (share of the estimate). */
        estimateSpread: share,
      })
      .strict(),
    motivations: z.array(motivationSchema).min(1),
    lifetime: z
      .object({
        maxDays: days,
        firstPriceDropDays: days,
        priceDropEveryDays: z.number().int().positive(),
        priceDropShare: range,
        /** The seller lowers the price only while asking ≥ value × this. */
        overpricedRatio: positive,
      })
      .strict(),
    otherBuyers: z
      .object({
        /** Daily chance that someone else buys a listing priced at its value. */
        baseDailyProbability: share,
        /** How fast that chance grows with the bargain: × exp(k × (value / asking − 1)). */
        dealSensitivity: z.number().min(0),
        maxDailyProbability: share,
      })
      .strict(),
    negotiation: z
      .object({
        responseDelayDays: days,
        /** Extra discount the seller accepts per month on the market. */
        discountPerMonthOnline: share,
        maxDiscount: share,
        /** Discount lost per point of bargain (value / asking − 1): interest from other buyers. */
        competitionPenalty: z.number().min(0),
        /** Offers this close below the seller's floor get a counter-offer. */
        counterBand: share,
        counterValidityDays: z.number().int().positive(),
        maxOffersPerListing: z.number().int().positive(),
      })
      .strict(),
    visit: z
      .object({ minutes, travelMinutes: minutes, planningHorizonDays: z.number().int().positive() })
      .strict(),
    purchase: z
      .object({
        /** Paid at the compromis, refunded if the loan is refused. */
        depositShare: share,
        loanConditionDays: z.number().int().positive(),
        deedDelayDays: z.number().int().positive(),
      })
      .strict(),
    resale: z
      .object({
        agencyFeeShare: share,
        selfVisitMinutes: minutes,
        /** Daily chance of a visit for a property priced at its value. */
        dailyVisitProbability: share,
        /** An agency brings this many times more visits. */
        agencyVisitMultiplier: positive,
        /** Visits drop by exp(−k × (asking / value − 1)) when overpriced. */
        priceSensitivity: z.number().min(0),
        offerAfterVisit: share,
        /** Buyer's offer as a share of the asking price. */
        offerShare: range,
        /** A buyer never offers above value × this. */
        maxShareOfValue: positive,
        /** Hidden extra a buyer accepts on a counter-offer, as a share of their offer. */
        buyerFlexibility: share,
        offerValidityDays: z.number().int().positive(),
        buyerWithdrawalChance: share,
        deedDelayDays: z.number().int().positive(),
      })
      .strict(),
    prices: z
      .object({
        /** Monthly pull of each neighbourhood's trend towards its long-run trend. */
        trendReversion: share,
        /** Long-run yearly trend each neighbourhood drifts back to (percent). */
        longRunTrendPercent: z.number(),
        /** Weight of the observed (data) trend in the long-run trend. */
        dataTrendWeight: share,
        trendVolatilityPercent: z.number().min(0),
        monthlyNoisePercent: z.number().min(0),
        /** Price change per point of change in the lagged market rate (share, negative effect). */
        rateSensitivity: z.number().min(0),
        /** Smoothing of the market rate felt by prices (share of the gap closed each month). */
        rateLagShare: share,
        minIndex: positive,
        maxIndex: positive,
      })
      .strict(),
    ownership: z
      .object({
        /** Yearly property tax per m² (charged from milestone 2). */
        propertyTaxPerM2: z.object({ apartment: euros, house: euros, building: euros }).strict(),
        /** Monthly co-ownership charges per m² (apartments only, charged from milestone 2). */
        coOwnershipChargesPerM2: euros,
      })
      .strict(),
  })
  .strict();

/** Humorous texts: listing titles and seller motivations (docs/06, section 6.4). */
export const listingTextsSchema = z
  .object({
    kinds: z.record(z.enum(['apartment', 'house', 'building']), z.string().min(1)),
    conditions: z.record(conditionSchema, z.string().min(1)),
    titles: z
      .array(
        z
          .object({
            id,
            text: z.string().min(1),
            /** Only for these conditions (all when absent). */
            conditions: z.array(conditionSchema).min(1).optional(),
          })
          .strict(),
      )
      .min(1),
    motivations: z.record(id, z.string().min(1)),
    defects: z.record(id, z.string().min(1)),
  })
  .strict();

export type Condition = z.infer<typeof conditionSchema>;
export type MarketRules = z.infer<typeof marketRulesSchema>;
export type Motivation = z.infer<typeof motivationSchema>;
export type DefectRule = z.infer<typeof defectSchema>;
export type ListingTexts = z.infer<typeof listingTextsSchema>;
