import { z } from 'zod';
import { euros, share } from './common.ts';

/** Tax rules (docs/03-systemes/06-fiscalite.md), French rules of 2026, simplified. */

const allowanceSchema = z
  .object({
    /** Years of ownership (full years) from … to …, inclusive. */
    fromYear: z.number().int().min(1),
    toYear: z.number().int().min(1),
    /** Allowance gained for each of these years. */
    perYear: share,
  })
  .strict();

const feesSchema = z.object({ first: euros, perExtraProperty: euros }).strict();

export const taxRulesSchema = z
  .object({
    incomeTax: z
      .object({
        /** Progressive scale for one tax share: rate applied above each threshold. */
        brackets: z
          .array(z.object({ from: euros, rate: share }).strict())
          .min(1)
          .refine((b) => b[0]?.from === 0, { message: 'Le barème doit commencer à 0 €.' })
          .refine((b) => b.every((x, i) => i === 0 || x.from > (b[i - 1]?.from ?? 0)), {
            message: 'Les seuils doivent croître.',
          }),
        /** Flat allowance for professional expenses on salaries. */
        salaryAllowanceShare: share,
      })
      .strict(),
    socialContributions: z.object({ bare: share, furnished: share, capitalGains: share }).strict(),
    microFoncier: z.object({ allowanceShare: share, receiptsCeiling: euros }).strict(),
    microBic: z
      .object({ allowanceShare: share, minimumAllowance: euros, receiptsCeiling: euros })
      .strict(),
    /** Bare lets, real regime: deficit (interest excluded) deducted from the salary. */
    landlordDeficit: z
      .object({ globalCeiling: euros, carryYears: z.number().int().min(1) })
      .strict(),
    /** Furnished lets, real regime (LMNP): depreciation. */
    lmnp: z
      .object({
        /** Share of the acquisition cost that is the building (the land is not depreciated). */
        buildingShare: share,
        buildingYears: z.number().int().min(1),
        furnitureYears: z.number().int().min(1),
      })
      .strict(),
    /** Yearly accountant fees for the properties in a real regime (Yvon Tableur). */
    accountantFees: z.object({ bare: feesSchema, furnished: feesSchema }).strict(),
    /** Day the property tax is charged. */
    propertyTaxDate: z
      .object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(28) })
      .strict(),
    capitalGains: z
      .object({
        incomeTaxRate: share,
        /** Flat acquisition fees, if larger than the real ones, as a share of the price. */
        acquisitionFeesFlatShare: share,
        /** Flat works allowance after this many full years, as a share of the price. */
        worksFlatShare: share,
        worksFlatMinYears: z.number().int().min(0),
        incomeTaxAllowances: z.array(allowanceSchema).min(1),
        socialAllowances: z.array(allowanceSchema).min(1),
      })
      .strict(),
  })
  .strict();

export type TaxRules = z.infer<typeof taxRulesSchema>;
