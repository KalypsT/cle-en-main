import { z } from 'zod';
import { conditionSchema } from './market.ts';
import { share } from './common.ts';

const range = z
  .object({ min: z.number(), max: z.number() })
  .strict()
  .refine((r) => r.max >= r.min, { message: 'max doit être supérieur ou égal à min.' });

/**
 * Provisional renting of milestone 1c: every owned property finds a tenant on
 * its own after a vacancy. Leases, applications and incidents replace it in
 * milestone 2 (docs/03-systemes/04).
 */
export const rentingRulesSchema = z
  .object({
    /** Days before the first tenant, and between two tenants. */
    vacancyDays: range,
    /** Monthly chance that the tenant leaves. */
    monthlyDepartureProbability: share,
    /** Flats with at most this many rooms use the small-flat rent per m². */
    smallApartmentMaxRooms: z.number().int().min(1),
    /** Rents follow property prices with this elasticity (d log rent / d log price index). */
    priceIndexElasticity: z.number().min(0),
    /** Rent factor by condition; 0 means the property cannot be let. */
    conditionFactors: z.record(conditionSchema, z.number().min(0)),
    /**
     * Share of the rent eaten by what milestone 2 will charge for real:
     * co-ownership charges, property tax, upkeep, and income tax.
     */
    ownerCostsShare: share,
  })
  .strict();

export type RentingRules = z.infer<typeof rentingRulesSchema>;
