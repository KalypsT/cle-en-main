import type { ChronicleKind } from './state.ts';
import type {
  AdviceKind,
  Condition,
  DpeLabel,
  Epoch,
  LeaseType,
  Moment,
  Season,
  Tier,
  Weather,
} from './content.ts';

/**
 * Enumerations the save schema checks. The engine imports only types from
 * @cle/content, so the values are repeated here; the assertions below fail
 * to compile if they drift from the content schemas.
 */
export const EPOCHS = [
  'before1948',
  'from1948to1974',
  'from1975to1988',
  'from1989to2005',
  'from2006to2012',
  'after2012',
] as const satisfies readonly Epoch[];
export const DPE_LABELS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
] as const satisfies readonly DpeLabel[];
export const CONDITIONS = [
  'ruin',
  'toRenovate',
  'toRefresh',
  'good',
  'renovated',
] as const satisfies readonly Condition[];
export const LEASE_TYPES = [
  'bare',
  'furnished',
  'shared',
  'shortTerm',
  'commercial',
  'parking',
] as const satisfies readonly LeaseType[];
export const TIERS = ['eco', 'standard', 'premium'] as const satisfies readonly Tier[];

/** Moments of the day, seasons and weathers of the living world, in order. */
export const MOMENTS = ['morning', 'day', 'evening', 'night'] as const satisfies readonly Moment[];
export const SEASONS = [
  'spring',
  'summer',
  'autumn',
  'winter',
] as const satisfies readonly Season[];
export const WEATHERS = [
  'sun',
  'clouds',
  'rain',
  'snow',
  'fog',
] as const satisfies readonly Weather[];

export const ADVICE_KINDS = [
  'netWorthUp',
  'netWorthDown',
  'goodYear',
  'badYear',
  'taxFree',
  'bigTax',
  'betterRegime',
  'autoRegime',
  'deficitCarry',
  'dpeBan',
  'vacancy',
  'lowReserve',
  'highDebt',
  'renegotiate',
  'noProperty',
  'firstYear',
  'negativeCashFlow',
] as const satisfies readonly AdviceKind[];

/** Kinds of chronicle entries (state.ts). */
export const CHRONICLE_KINDS = [
  'start',
  'firstPurchase',
  'firstLease',
  'firstWorks',
  'firstSale',
  'homeBought',
  'title',
  'achievement',
  'challengeWon',
  'challengeLost',
  'majorEvent',
  'forcedSale',
  'bankrupt',
  'freshStart',
  'gameOver',
  'rewind',
  'record',
  'companyCreated',
  'rivalArrived',
  'movedCity',
  'firstRemotePurchase',
  'firstEviction',
  'firstLoanRepaid',
  'firstTransformation',
] as const satisfies readonly ChronicleKind[];

type Exhaustive<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type ConstantsMatchContent = [
  Assert<Exhaustive<(typeof EPOCHS)[number], Epoch>>,
  Assert<Exhaustive<(typeof DPE_LABELS)[number], DpeLabel>>,
  Assert<Exhaustive<(typeof CONDITIONS)[number], Condition>>,
  Assert<Exhaustive<(typeof LEASE_TYPES)[number], LeaseType>>,
  Assert<Exhaustive<(typeof TIERS)[number], Tier>>,
  Assert<Exhaustive<(typeof MOMENTS)[number], Moment>>,
  Assert<Exhaustive<(typeof SEASONS)[number], Season>>,
  Assert<Exhaustive<(typeof WEATHERS)[number], Weather>>,
  Assert<Exhaustive<(typeof ADVICE_KINDS)[number], AdviceKind>>,
  Assert<Exhaustive<(typeof CHRONICLE_KINDS)[number], ChronicleKind>>,
];
