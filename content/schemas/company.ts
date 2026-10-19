import { z } from 'zod';
import { euros, share } from './common.ts';
import { leaseTypeSchema } from './renting.ts';

/**
 * The SCI (docs/03-systemes/06, milestone 8): a société civile immobilière at the income tax,
 * transparent. One balance sheet with the player; its loans are judged on the property's own
 * rent (the « différentiel ») rather than on the player's debt ratio.
 */
export const companyRulesSchema = z
  .object({
    /** Statutes, registry and legal notice, paid once. */
    creationCost: euros,
    /** Yearly accountant of the SCI (déclaration 2072), from its creation. */
    accountantFees: z.object({ first: euros, perExtraProperty: euros }).strict(),
    /** Leases a property held by the SCI may have (furnished lets would bring the IS). */
    leaseTypes: z.array(leaseTypeSchema).min(1),
    credit: z
      .object({
        /** Contribution asked beyond the fees, as a share of the price. */
        extraContributionShare: share,
        /** The property's potential rent times this must cover the monthly payment. */
        rentCoverageShare: share,
        /** The SCI's debts after the loan stay under this multiple of the player's net worth. */
        maxLeverage: z.number().min(0),
        /** With works in the loan, the rent counted is that of a home renovated to this state. */
        renovatedState: z.number().min(1).max(5),
      })
      .strict(),
  })
  .strict();

export type CompanyRules = z.infer<typeof companyRulesSchema>;
