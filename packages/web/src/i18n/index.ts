import { en } from "./en.js";
import { ko } from "./ko.js";
import type { PixenStrings } from "./types.js";

/**
 * The locale registry.
 *
 * Locales are data, so a host can ship its own without waiting for a release —
 * and every locale is completed from `en`, so a partial translation renders
 * English for the strings it does not cover rather than blank chrome.
 */
const locales = new Map<string, PixenStrings>([
  ["en", en],
  ["ko", ko],
]);

export function registerLocale(locale: string, strings: Partial<PixenStrings>): void {
  locales.set(locale, { ...en, ...strings });
}

export function resolveStrings(locale: string | null | undefined): PixenStrings {
  if (!locale) return en;
  // "ko-KR" falls back to "ko" before falling back to English.
  return locales.get(locale) ?? locales.get(locale.split("-")[0] ?? "") ?? en;
}

export { en, ko };
export type { PixenStrings };
