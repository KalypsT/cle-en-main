import type { Condition, DpeLabel, Epoch } from './content.ts';

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

type Exhaustive<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type ConstantsMatchContent = [
  Assert<Exhaustive<(typeof EPOCHS)[number], Epoch>>,
  Assert<Exhaustive<(typeof DPE_LABELS)[number], DpeLabel>>,
  Assert<Exhaustive<(typeof CONDITIONS)[number], Condition>>,
];
