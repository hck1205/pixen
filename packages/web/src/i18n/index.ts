import { ar } from "./ar.js";
import { de } from "./de.js";
import { en } from "./en.js";
import { es } from "./es.js";
import { fr } from "./fr.js";
import { ja } from "./ja.js";
import { ko } from "./ko.js";
import { pt } from "./pt.js";
import { zh } from "./zh.js";
import { baseLanguage, pickLocale } from "./pick.js";
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
  ["ar", ar],
  ["de", de],
  ["es", es],
  ["fr", fr],
  ["ja", ja],
  ["ko", ko],
  ["pt", pt],
  ["zh", zh],
]);

/**
 * Languages written right to left.
 *
 * The element mirrors its layout for these unless the host has said otherwise,
 * because a tool rail on the left is wrong in a page that reads from the right.
 */
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur", "ps", "sd", "yi"]);

export function registerLocale(locale: string, strings: Partial<PixenStrings>): void {
  locales.set(locale, { ...en, ...strings });
}

export function resolveStrings(locale: string | null | undefined): PixenStrings {
  return pickLocale(locales, locale) ?? en;
}

/** Writing direction for a locale tag, for hosts that do not set one. */
export function directionFor(locale: string | null | undefined): "ltr" | "rtl" {
  return locale && RTL_LANGUAGES.has(baseLanguage(locale)) ? "rtl" : "ltr";
}

/** Every locale Pixen ships, for a host offering a language picker. */
export function availableLocales(): string[] {
  return [...locales.keys()].sort();
}

export { pickLocale } from "./pick.js";
export { ar, de, en, es, fr, ja, ko, pt, zh };
export type { PixenStrings };
