/**
 * Holds `value` between `low` and `high`.
 *
 * Six places wrote `Math.min(high, Math.max(low, value))` out by hand, which is
 * two calls whose order has to be right and reads as neither of the two words
 * it means. It is one line either way; the difference is that this one says so.
 */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Last element, or undefined. Deliberately not `Array.prototype.at`: this is
 * called from the engine's hot paths and from the published packages, and the
 * helper costs a line while `at()` costs two years of browser support.
 */
export function last<T>(items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[items.length - 1];
}

/** Inserts `item` at `index`, clamping the index into range. */
export function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const at = clamp(index, 0, items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  if (index < 0 || index >= items.length) return [...items];
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

/** Moves the item at `from` to `to`, clamping both. Returns a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  const item = items[from]!;
  return insertAt(removeAt(items, from), to, item);
}
