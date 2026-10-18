/**
 * Deep copy of plain JSON data (the game state). Hot path: runs on every day
 * and action. Frozen objects and arrays are shared instead of copied.
 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  // Frozen data (rooms and items of a dwelling) is never mutated: it is shared.
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    const items = value as unknown[];
    const copy = new Array<unknown>(items.length);
    for (let i = 0; i < items.length; i++) copy[i] = deepClone(items[i]);
    return copy as T;
  }
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key in source) copy[key] = deepClone(source[key]);
  return copy as T;
}
