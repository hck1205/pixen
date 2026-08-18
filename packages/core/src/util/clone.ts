/**
 * Structured clone with a hand-rolled fallback. Documents are plain JSON data by
 * contract, so the fallback is complete for them.
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
