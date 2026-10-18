import { z } from 'zod';
import { euros, id, percent, share, trust } from './common.ts';
import { bankTrustSchema } from './jobs.ts';

const bankTrustLevels = <T extends z.ZodType>(value: T) =>
  z.object({ veryHigh: value, high: value, medium: value, mediumLow: value }).strict();

/** Common credit rules (docs/03-systemes/02-banque-et-credit.md). */
export const creditRulesSchema = z
  .object({
    maxDebtRatio: share,
    minDurationYears: z.number().int().positive(),
    maxDurationYears: z.number().int().positive(),
    maxDurationWithWorksYears: z.number().int().positive(),
    /** Works must be at least this share of the project for the longer duration. */
    worksShareForLongerDuration: share,
    /** A partial agreement is only offered for at least this share of the request. */
    partialAgreementMinShare: share,
    /** Share of rents the banks count as income. */
    retainedRentShare: share,
    notaryFeesShare: share,
    bankFeesShare: share,
    /** Borrower insurance, included in the displayed rate. */
    insurancePercent: percent,
    /** Spread added to the 20-year market rate, by duration in years (interpolated). */
    durationSpreadPercent: z.record(z.string().regex(/^\d+$/), percent),
    overdraftAnnualPercent: percent,
    /** After resigning, banks lend only with this much rental history. */
    minRentalHistoryMonthsWithoutSalary: z.number().int().min(0),
    /** Descent towards bankruptcy (docs/02, section 2.6). */
    distress: z
      .object({
        /** Days of overdraft after which the bank forces the sale of a property. */
        forcedSaleAfterOverdraftDays: z.number().int().positive(),
        /** Discount on the real value of a forced sale. */
        forcedSaleDiscount: share,
        /** Trust lost with the account bank at each forced sale. */
        forcedSaleTrust: z.number(),
      })
      .strict(),
    renegotiation: z
      .object({
        /** Market offer must beat the loan rate by this much to be suggested. */
        thresholdPercent: percent,
        /** One-off fees: share of the remaining capital plus a fixed amount. */
        feesShareOfRemaining: share,
        fixedFees: euros,
      })
      .strict(),
    trust: z
      .object({
        startByJob: bankTrustLevels(trust),
        /** Margin adjustment by job profile, in percentage points. */
        marginByJobPercent: bankTrustLevels(percent),
        /** Margin discount at trust 100 (and surcharge at trust 0), in percentage points. */
        marginSwingPercent: percent,
        onTimePayment: z.number(),
        relationshipMonth: z.number(),
        overdraftDay: z.number(),
        refusedApplication: z.number(),
        meeting: z.number(),
        meetingCooldownDays: z.number().int().min(0),
        meetingMinutes: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export const bankSchema = z
  .object({
    id,
    name: z.string().min(1),
    banker: z.object({ name: z.string().min(1), description: z.string().min(1) }).strict(),
    policy: z.string().min(1),
    marginPercent: percent,
    responseDelayDays: z.number().int().min(0),
    /** Minimum trust to lend at all. */
    minTrust: trust,
    /** Minimum job profile to lend at all. */
    minJobTrust: bankTrustSchema,
    derogation: z.object({ minTrust: trust, maxDebtRatio: share }).strict().nullable(),
    /** Whether the bank answers with a reduced amount or a longer duration. */
    counterOffers: z.boolean(),
    /** Whether the banker takes meetings (a chatbot does not). */
    meetings: z.boolean(),
  })
  .strict();

export const banksFileSchema = z
  .object({
    banks: z
      .array(bankSchema)
      .min(1)
      .refine(
        (banks) => new Set(banks.map((b) => b.id)).size === banks.length,
        'Duplicate bank id',
      ),
  })
  .strict();

/** Slow simulation of the national market rate (20-year reference, insurance excluded). */
export const marketRateSchema = z
  .object({
    startPercent: percent,
    longTermMeanPercent: percent,
    cycleAmplitudePercent: percent,
    cycleMonths: z.number().int().positive(),
    /** Share of the gap to the cycle target closed each month. */
    monthlyReversion: share,
    monthlyVolatilityPercent: percent,
    minPercent: percent,
    maxPercent: percent,
  })
  .strict();

export type CreditRules = z.infer<typeof creditRulesSchema>;
export type Bank = z.infer<typeof bankSchema>;
export type MarketRate = z.infer<typeof marketRateSchema>;
