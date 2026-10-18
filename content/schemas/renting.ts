import { z } from 'zod';
import { dpeLabelSchema } from './city.ts';
import { euros, id, share } from './common.ts';
import { conditionSchema } from './market.ts';

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

export const LEASE_TYPES = ['bare', 'furnished'] as const;
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
  })
  .strict();

const incidentSchema = z
  .object({
    id,
    /** Monthly chance in a property in good condition. */
    monthlyProbability: share,
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
    /** Rent factor by condition; 0 means the property is indecent and cannot be let. */
    conditionFactors: z.record(conditionSchema, z.number().min(0)),
    dpeFactors: z.record(dpeLabelSchema, z.number().positive()),
    /** Rents the player may ask, as a share of the market rent of the lease type. */
    rentRange: range,
    leaseTypes: z.record(leaseTypeSchema, leaseTypeRulesSchema),
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
        byCondition: z.record(conditionSchema, z.number()),
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
    incidentConditionFactors: z.record(conditionSchema, z.number().min(0)),
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
