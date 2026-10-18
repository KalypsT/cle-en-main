/** Deep copy of plain JSON data (the game state). */
export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepClone) as T;
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = deepClone(item);
    return copy as T;
  }
  return value;
}
