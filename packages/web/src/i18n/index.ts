import { en } from "./en.js";
import { baseLanguage, pickLocale } from "./pick.js";
import type { PixenStrings } from "./types.js";

/**
 * The locale registry.
 *
 * English is the only language in the bundle by default, and the other eight
 * are imported when they are wanted:
 *
 * ```js
 * import { registerLocale } from "@pixen/web";
 * import { ko } from "@pixen/web/locale/ko";
 * registerLocale("ko", ko);
 * ```
 *
 * They used to be imported here, all nine, which put every one of them in every
 * host's bundle. Measured: the registry is 40,455 bytes minified against 3,125
 * for one language, and 10.7 KB of the 63.5 KB this package gzips to — a sixth
 * of the download, of which a host that ships one language uses a ninth.
 *
 * `registerBundledLocales()` is the one line back to the old behaviour for a
 * host that wants all of them, and asking for a language nobody registered says
 * so rather than quietly rendering English.
 *
 * Locales are data, so a host can ship its own without waiting for a release,
 * and every locale is completed from `en` — a partial translation renders
 * English for the strings it does not cover rather than blank chrome.
 */
const locales = new Map<string, PixenStrings>([["en", en]]);

/**
 * Languages written right to left.
 *
 * The element mirrors its layout for these unless the host has said otherwise,
 * because a tool rail on the left is wrong in a page that reads from the right.
 * Listed rather than derived from what is registered: the direction of a
 * language does not depend on whether its strings are in the bundle.
 */
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur", "ps", "sd", "yi"]);

/** Locales asked for and not found, so the warning is said once each. */
const unregistered = new Set<string>();

export function registerLocale(locale: string, strings: Partial<PixenStrings>): void {
  locales.set(locale, { ...en, ...strings });
}

export function resolveStrings(locale: string | null | undefined): PixenStrings {
  const found = pickLocale(locales, locale);
  if (found) return found;
  if (locale) warnUnregistered(locale);
  return en;
}

/**
 * Says what to import, once per language.
 *
 * A locale that is not in the bundle renders English, which is the right thing
 * to do and the wrong thing to do silently: it looks exactly like a missing
 * translation, and the fix is one import a developer has no way to guess.
 */
function warnUnregistered(locale: string): void {
  const language = baseLanguage(locale);
  if (language === "en" || unregistered.has(language)) return;
  unregistered.add(language);
  console.warn(
    `Pixen: no strings registered for "${locale}", so English is being shown. ` +
      `Import them — registerLocale("${language}", (await import("@pixen/web/locale/${language}")).${language}) ` +
      `— or call registerBundledLocales() for all of the ones Pixen ships.`,
  );
}

/** Writing direction for a locale tag, for hosts that do not set one. */
export function directionFor(locale: string | null | undefined): "ltr" | "rtl" {
  return locale && RTL_LANGUAGES.has(baseLanguage(locale)) ? "rtl" : "ltr";
}

/** Every locale this page has strings for, for a host offering a picker. */
export function availableLocales(): string[] {
  return [...locales.keys()].sort();
}

export { pickLocale } from "./pick.js";
export { en };
export type { PixenStrings };
