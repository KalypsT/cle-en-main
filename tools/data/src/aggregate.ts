/** Pure statistics used to turn raw sales and certificates into a city file. */

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const a = sorted[low] ?? 0;
  const b = sorted[high] ?? a;
  return a + (b - a) * (position - low);
}

/** Weighted blend towards a reference when the sample is small (empirical Bayes style). */
export function shrink(value: number, count: number, reference: number, weight: number): number {
  return (value * count + reference * weight) / (count + weight);
}

/** Counts → shares over fixed keys, blended with reference shares (pseudo-counts). */
export function shares<K extends string>(
  keys: readonly K[],
  counts: Partial<Record<K, number>>,
  reference: Partial<Record<K, number>> | null,
  weight: number,
): Record<K, number> {
  const raw = keys.map((key) => {
    const prior = reference ? (reference[key] ?? 0) * weight : 0;
    return (counts[key] ?? 0) + prior;
  });
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  // Round to 3 decimals and give the rounding remainder to the largest share.
  const rounded = raw.map((value) => Math.round((value / sum) * 1000) / 1000);
  const largest = rounded.indexOf(Math.max(...rounded));
  rounded[largest] =
    Math.round(((rounded[largest] ?? 0) + 1 - rounded.reduce((a, b) => a + b, 0)) * 1000) / 1000;
  return Object.fromEntries(keys.map((key, index) => [key, rounded[index] ?? 0])) as Record<
    K,
    number
  >;
}

/** Ordinary least squares slope of y on x. */
export function slope(points: readonly (readonly [number, number])[]): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const mx = points.reduce((sum, [x]) => sum + x, 0) / n;
  const my = points.reduce((sum, [, y]) => sum + y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const [x, y] of points) {
    numerator += (x - mx) * (y - my);
    denominator += (x - mx) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Fractional year of an ISO date (2024-07-01 → about 2024.5). */
export function yearOf(isoDate: string): number {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  return year + (month - 1) / 12 + (day - 1) / 365;
}

/**
 * Yearly trend of log(price per m²) over time, with one intercept per group
 * (dwelling kind) so that a change in the mix does not read as a trend.
 */
export function trendPercentPerYear(
  sales: readonly { group: string; year: number; perM2: number }[],
): number {
  const byGroup = new Map<string, { year: number; log: number }[]>();
  for (const sale of sales) {
    const list = byGroup.get(sale.group) ?? [];
    list.push({ year: sale.year, log: Math.log(sale.perM2) });
    byGroup.set(sale.group, list);
  }
  const centred: [number, number][] = [];
  for (const list of byGroup.values()) {
    const my = list.reduce((sum, s) => sum + s.year, 0) / list.length;
    const ml = list.reduce((sum, s) => sum + s.log, 0) / list.length;
    for (const s of list) centred.push([s.year - my, s.log - ml]);
  }
  return (Math.exp(slope(centred)) - 1) * 100;
}

/** Shares of values falling in consecutive bins [edges[i], edges[i+1]). */
export function binCounts(values: readonly number[], edges: readonly number[]): number[] {
  const counts = new Array<number>(edges.length - 1).fill(0);
  for (const value of values) {
    for (let i = 0; i < edges.length - 1; i++) {
      const low = edges[i] ?? 0;
      const high = edges[i + 1] ?? 0;
      if (value >= low && (value < high || (i === edges.length - 2 && value <= high))) {
        counts[i] = (counts[i] ?? 0) + 1;
        break;
      }
    }
  }
  return counts;
}

export const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
