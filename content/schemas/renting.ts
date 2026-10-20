import { z } from 'zod';
import { dpeLabelSchema } from './city.ts';
import { euros, id, share } from './common.ts';
import { itemKindSchema } from './works.ts';
import { propertyKindSchema } from './market.ts';

/** Renting rules (docs/03-systemes/04-location.md). */

const range = z
  .object({ min: z.number(), max: z.number() })
  .strict()
  .refine((r) => r.max >= r.min, { message: 'max doit être supérieur ou égal à min.' });
const intRange = z
  .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
  .strict()
  .refine((r) => r.max >= r.min, { message: 'max doit être supérieur ou égal à min.' });
const months = z.number().int().min(1);
const minutes = z.number().int().min(0);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Five values, for states 1 to 5. */
const byState = z.array(z.number()).length(5);

export const LEASE_TYPES = [
  'bare',
  'furnished',
  'shared',
  'shortTerm',
  'commercial',
  'parking',
] as const;
export const leaseTypeSchema = z.enum(LEASE_TYPES);
export const CONTRACTS = ['permanent', 'fixedTerm', 'student', 'retired', 'selfEmployed'] as const;

const leaseTypeRulesSchema = z
  .object({
    /** Rent relative to the bare market rent. */
    rentFactor: z.number().positive(),
    /** Length of a lease term; renewed tacitly at its end. */
    termMonths: months,
    /** Shorter term for a student (furnished student lease); null if none. */
    studentTermMonths: months.nullable(),
    /** Security deposit, in months of rent excluding charges. */
    depositMonths: z.number().int().min(0),
    /** Tenant's notice period. */
    noticeMonths: months,
    /** Monthly chance that a satisfied tenant gives notice. */
    monthlyDepartureProbability: share,
    /** Kinds of property it lets (a shop has its commercial lease). */
    kinds: z.array(propertyKindSchema).min(1),
    /** Incidents happen (a shop's tenant sees to his own repairs, a parking space has none). */
    incidents: z.boolean(),
    /** Needs furniture (bought when the property is first offered). */
    furnished: z.boolean(),
    /** Fewest rooms the dwelling needs (a flat-share needs bedrooms). */
    minRooms: z.number().int().min(0),
    /**
     * What the tenant hides he would take to leave early (« départ négocié »), in months of
     * rent excluding charges; null: no negotiated departure (a short-term let just stops).
     */
    buyoutMonths: z
      .object({ min: z.number().min(0), max: z.number().min(0) })
      .strict()
      .nullable(),
    /**
     * Discount buyers apply to a property sold with this tenant in place, by months left of
     * the lease term (the first line whose minimum is reached, from the longest); empty: none.
     */
    occupiedSaleDiscounts: z.array(
      z.object({ minMonthsLeft: z.number().int().min(0), share }).strict(),
    ),
    /** Tax family of the rents: revenus fonciers (bare) or BIC (furnished). */
    taxCategory: z.enum(['bare', 'furnished']),
    /** Own micro-BIC allowance and ceiling (furnished tourist lets); null: the general one. */
    microBic: z.object({ allowanceShare: share, receiptsCeiling: euros }).strict().nullable(),
    /** Multiplier on the arrival of candidates. */
    applicationRate: z.number().min(0),
    /** The tenant pays back part of the co-ownership charges (not in a short-term let). */
    recoverableCharges: z.boolean(),
    /**
     * Short-term let (milestone 8, simplified): no tenant to choose, the guests come at once;
     * the rent above is the monthly income at the average occupancy, varied by month. A
     * self-managing owner spends free time every day (a day missed is a day lost).
     */
    shortTerm: z
      .object({
        /** Twelve monthly factors, January first, averaging 1. */
        seasonality: z.array(z.number().min(0)).length(12),
        selfMinutesPerDay: minutes,
        /** Tenant profile of the guests (no departure, no unpaid rent). */
        guestProfileId: id,
      })
      .strict()
      .nullable(),
  })
  .strict();

const profileSchema = z
  .object({
    id,
    contract: z.enum(CONTRACTS),
    /** Draw weight among candidates, by lease type. */
    weights: z.record(leaseTypeSchema, z.number().min(0)),
    /** Monthly income as a multiple of the market rent (visible on the application). */
    incomeToRent: range,
    guarantorChance: share,
    /** Hidden reliability before the visible clues, 0 … 1. */
    reliability: range,
    /** Multiplier on the departure probability. */
    mobility: z.number().min(0),
    /** Years the candidate hopes to stay (shown on the application). */
    desiredYears: intRange,
  })
  .strict();

const traitSchema = z
  .object({
    id,
    weight: z.number().min(0),
    /** Small hidden effect of the trait on reliability. */
    reliability: z.number(),
  })
  .strict();

const agencySchema = z
  .object({
    id,
    name: z.string().min(1),
    /** Fees, as a share of the rents collected. */
    feeShare: share,
    /** Multiplier on the arrival of candidates (fills homes faster). */
    applicationRate: z.number().positive(),
    /** Added to the reliability of the candidates it brings. */
    reliabilityShift: z.number(),
    /** Standard deviation of the agency's error when it ranks candidates. */
    judgementNoise: z.number().min(0),
    /** Days the agency waits for candidates before choosing one. */
    selectionDays: z.number().int().min(0),
    /** Days before its artisan fixes an incident. */
    incidentDays: intRange,
    /** Lease types it manages (a conciergerie only does short-term lets). */
    leaseTypes: z.array(leaseTypeSchema).min(1),
  })
  .strict();

const incidentSchema = z
  .object({
    id,
    /** Monthly chance in a property in good condition. */
    monthlyProbability: share,
    /** Item whose state makes it more or less frequent. */
    item: itemKindSchema,
    /** Can the owner fix it himself? */
    selfRepair: z.boolean(),
    selfMinutes: minutes,
    /** Parts bought when fixing it oneself. */
    selfCost: range,
    artisanCost: range,
    artisanDays: intRange,
    /** Satisfaction lost when it happens, then every day it lasts. */
    satisfactionHit: z.number().min(0),
    dailySatisfactionLoss: z.number().min(0),
  })
  .strict();

const lifeEventSchema = z
  .object({
    id,
    weight: z.number().min(0),
    /** Only tenants of these profiles; all when absent. */
    profiles: z.array(id).min(1).optional(),
    /** Chance that the tenant gives notice right away. */
    noticeChance: share,
    /** Notice period in that case (null: the lease type's). */
    noticeMonths: months.nullable(),
    /** Lasting multiplier on the tenant's mobility. */
    mobilityFactor: z.number().min(0),
    satisfaction: z.number(),
    /** The tenant asks for small works: cost paid by the owner. */
    requestCost: range.optional(),
  })
  .strict();

export const rentingRulesSchema = z
  .object({
    /** Flats with at most this many rooms use the small-flat rent per m². */
    smallApartmentMaxRooms: z.number().int().min(1),
    /** Rents follow property prices with this elasticity (d log rent / d log price index). */
    priceIndexElasticity: z.number().min(0),
    /** The city's rents per m² include charges: the recoverable charges are taken out. */
    dataRentsIncludeCharges: z.boolean(),
    /** Rent factor by the dwelling's weighted state (1 to 5, interpolated). */
    stateRentFactors: byState,
    /** Below this weighted state, or with a critical item at state 1, the home is indecent. */
    indecentBelowState: z.number().min(1).max(5),
    dpeFactors: z.record(dpeLabelSchema, z.number().positive()),
    /** Rents the player may ask, as a share of the market rent of the lease type. */
    rentRange: range,
    leaseTypes: z.record(leaseTypeSchema, leaseTypeRulesSchema),
    /** Negotiated departure of a tenant (feedback after milestone 8). */
    buyout: z
      .object({
        /** Free time of the meeting with the tenant. */
        minutes: z.number().int().min(0),
        /** An unhappy tenant (satisfaction below this) asks for less. */
        unhappyBelow: z.number().min(0).max(100),
        unhappyFactor: z.number().positive(),
        /** Profiles attached to their home, who ask for more. */
        attachedProfiles: z.array(z.string()),
        attachedFactor: z.number().positive(),
        /** Satisfaction lost by a refused offer, and days before the next one. */
        refusalSatisfaction: z.number().min(0),
        retryDays: z.number().int().min(0),
        /** Days between the agreement and the move out. */
        leaveAfterDays: z.number().int().min(1),
        /** Reputation lost by each negotiated departure (an eviction costs more). */
        reputationPenalty: z.number().min(0),
      })
      .strict(),
    /** Share of the co-ownership charges the tenant pays back. */
    recoverableChargesShare: share,
    furniture: z.object({ perM2: euros, minimum: euros, maximum: euros }).strict(),
    /** Landlord insurance (propriétaire non occupant), per year. */
    ownerInsurance: z.object({ base: euros, perM2: euros }).strict(),
    /** Garantie loyers impayés: premium as a share of rent and charges. */
    unpaidRentInsurance: z.object({ premiumShare: share }).strict(),
    applications: z
      .object({
        /** Daily chance of a candidate at the market rent. */
        dailyProbability: share,
        /** Candidates arrive exp(−s × (asked / market − 1)) times as often. */
        rentSensitivity: z.number().min(0),
        maxPending: z.number().int().min(1),
        validityDays: intRange,
        /** Reliability lost per point of asked/market rent above 1 (fragile candidates). */
        fragility: z.number().min(0),
        /** Income/rent ratio a landlord expects (the usual « 3 fois le loyer »). */
        referenceIncomeRatio: z.number().positive(),
        /** Reliability gained per unit of income/rent above the reference, and with a guarantor. */
        incomeReliability: z.number().min(0),
        /** Bounds of the income effect: a high income helps less than a low one hurts. */
        incomeEffect: range,
        /** Bounds of a tenant's reliability. */
        reliabilityBounds: range,
        guarantorReliability: z.number().min(0),
        /** Spread of the hidden part of reliability. */
        hiddenNoise: z.number().min(0),
      })
      .strict(),
    /** Free time of a self-managing owner. */
    selfManagement: z
      .object({
        visitMinutes: minutes,
        moveInMinutes: minutes,
        moveOutMinutes: minutes,
        reminderMinutes: minutes,
      })
      .strict(),
    profiles: z.array(profileSchema).min(1),
    traits: z.array(traitSchema).min(1),
    agencies: z.array(agencySchema).min(1),
    satisfaction: z
      .object({
        initial: z.number().min(0).max(100),
        base: z.number(),
        /** Target shift by the dwelling's weighted state (1 to 5, interpolated). */
        byState,
        /** Points lost per percent of rent above the market (gained below). */
        perPercentOverMarket: z.number().min(0),
        /** Share of the gap to the target closed every month. */
        monthlyConvergence: share,
        /** Departure multiplier = 1 + (pivot − satisfaction) / span when below the pivot. */
        departurePivot: z.number(),
        departureSpan: z.number().positive(),
      })
      .strict(),
    incidents: z.array(incidentSchema).min(1),
    /** Incident multiplier by the state of the incident's item. */
    incidentStateFactors: byState,
    /** An incident left this long makes the tenant give notice. */
    incidentPatienceDays: z.number().int().min(1),
    unpaid: z
      .object({
        /** Monthly chance of a missed rent for a tenant of reliability 0. */
        monthlyProbability: share,
        reminderAfterDays: z.number().int().min(0),
        /** Chance that a reminder settles the debt, times the tenant's reliability. */
        reminderSuccess: share,
        /** Unpaid months that start the court procedure. */
        procedureAfterMonths: months,
        procedureCost: range,
        procedureMonths: intRange,
        /** No eviction during the winter truce (months, inclusive, wrapping over the new year). */
        winterTruce: z
          .object({ fromMonth: z.number().int().min(1).max(12), toMonth: z.number().int() })
          .strict(),
        reputationPenalty: z.number().min(0),
      })
      .strict(),
    /** Damages at departure: chance for a tenant of reliability 0, cost per m². */
    damages: z.object({ probability: share, perM2: range }).strict(),
    lifeEvents: z
      .object({ yearlyProbability: share, events: z.array(lifeEventSchema).min(1) })
      .strict(),
    /** Yearly rent revision, inspired by the IRL: follows market rents, never down, capped. */
    rentRevision: z.object({ maxYearlyPercent: z.number().min(0) }).strict(),
    dpe: z
      .object({
        /** From this date, a new lease (or a renewal) is forbidden for the class. */
        letBanFrom: z.partialRecord(dpeLabelSchema, isoDate),
        /** Warn the owner this many months before a ban. */
        warningMonths: months,
      })
      .strict(),
  })
  .strict();

/** Texts of tenants: names, traits, life events, incidents (content/textes/locataires.json). */
export const tenantTextsSchema = z
  .object({
    firstNames: z.array(z.string().min(1)).min(10),
    lastNames: z.array(z.string().min(1)).min(10),
    contracts: z.record(z.enum(CONTRACTS), z.string().min(1)),
    profiles: z.record(z.string(), z.string().min(1)),
    traits: z.record(z.string(), z.string().min(1)),
    lifeEvents: z.record(z.string(), z.string().min(1)),
    incidents: z.record(z.string(), z.string().min(1)),
  })
  .strict();

export type LeaseType = z.infer<typeof leaseTypeSchema>;
export type Contract = (typeof CONTRACTS)[number];
export type RentingRules = z.infer<typeof rentingRulesSchema>;
export type TenantProfile = RentingRules['profiles'][number];
export type Agency = RentingRules['agencies'][number];
export type IncidentRule = RentingRules['incidents'][number];
export type LifeEventRule = RentingRules['lifeEvents']['events'][number];
export type TenantTexts = z.infer<typeof tenantTextsSchema>;
