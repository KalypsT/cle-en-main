import { type Agency, findTenantProfile, type GameContent, type LeaseType } from '../content.ts';
import type { Cents } from '../money.ts';
import { nextFloat, nextInt, nextNormal, nextRange, pickWeighted } from '../random.ts';
import type { Tenant } from '../state.ts';
import type { SystemContext } from './context.ts';

/** Incomes are shown rounded to 10 €. */
const INCOME_ROUNDING = 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function incomeEffect(content: GameContent, income: Cents, rent: Cents): number {
  const rules = content.renting.applications;
  const ratio = rent > 0 ? income / rent : rules.referenceIncomeRatio;
  return clamp(
    rules.incomeReliability * (ratio - rules.referenceIncomeRatio),
    rules.incomeEffect.min,
    rules.incomeEffect.max,
  );
}

/**
 * Reliability the owner can read from an application: the profile's typical
 * reliability, the income compared with the rent and the guarantor. The hidden
 * part (trait, the agency's selection, fragility, noise) is not included.
 */
export function visibleReliability(content: GameContent, tenant: Tenant, rent: Cents): number {
  const profile = findTenantProfile(content, tenant.profileId);
  const rules = content.renting.applications;
  return (
    (profile.reliability.min + profile.reliability.max) / 2 +
    incomeEffect(content, tenant.monthlyIncome, rent) +
    (tenant.guarantor ? rules.guarantorReliability : 0)
  );
}

/**
 * A candidate for a property let at `rent` whose market rent is `marketRent`:
 * the higher the rent, the lower the income ratio and the more fragile the
 * candidate.
 */
export function drawTenant(
  ctx: SystemContext,
  leaseType: LeaseType,
  rent: Cents,
  marketRent: Cents,
  agency: Agency | undefined,
): Tenant {
  const { content, state } = ctx;
  const { renting, tenantTexts } = content;
  const rules = renting.applications;
  const profileId = pickWeighted(
    state.rng,
    Object.fromEntries(renting.profiles.map((p) => [p.id, p.weights[leaseType]])),
  );
  const profile = findTenantProfile(content, profileId);
  const traitId = pickWeighted(
    state.rng,
    Object.fromEntries(renting.traits.map((t) => [t.id, t.weight])),
  );
  const trait = renting.traits.find((t) => t.id === traitId);
  const income =
    Math.round(
      (marketRent * nextRange(state.rng, profile.incomeToRent.min, profile.incomeToRent.max)) /
        INCOME_ROUNDING,
    ) * INCOME_ROUNDING;
  const guarantor = nextFloat(state.rng) < profile.guarantorChance;
  const desiredYears = nextInt(state.rng, profile.desiredYears.min, profile.desiredYears.max);
  const overpricing = marketRent > 0 ? Math.max(0, rent / marketRent - 1) : 0;
  const reliability = clamp(
    nextRange(state.rng, profile.reliability.min, profile.reliability.max) +
      incomeEffect(content, income, rent) +
      (guarantor ? rules.guarantorReliability : 0) +
      (trait?.reliability ?? 0) +
      (agency?.reliabilityShift ?? 0) -
      rules.fragility * overpricing +
      rules.hiddenNoise * nextNormal(state.rng),
    rules.reliabilityBounds.min,
    rules.reliabilityBounds.max,
  );
  const firstName =
    tenantTexts.firstNames[nextInt(state.rng, 0, tenantTexts.firstNames.length - 1)] ?? '';
  const lastName =
    tenantTexts.lastNames[nextInt(state.rng, 0, tenantTexts.lastNames.length - 1)] ?? '';
  return {
    firstName,
    lastName,
    profileId,
    traitId,
    monthlyIncome: income,
    guarantor,
    desiredYears,
    reliability: Math.round(reliability * 1000) / 1000,
    mobility: profile.mobility,
  };
}
