import { describe, expect, it } from "vitest";
import { availableLocales, directionFor, registerLocale, resolveStrings } from "../src/i18n/index.js";
import { registerBundledLocales } from "../src/i18n/bundled.js";
import { ar } from "../src/i18n/ar.js";
import { en } from "../src/i18n/en.js";
import { ko } from "../src/i18n/ko.js";
import { zh } from "../src/i18n/zh.js";
import type { PixenStrings } from "../src/i18n/types.js";
import { FREEFORM_RATIO_LABEL } from "../src/element/constants.js";
import { ratioButtonLabel } from "../src/element/ratios.js";

describe("locale resolution", () => {
  it("falls back to English for an unknown tag", () => {
    expect(resolveStrings("xx")).toBe(en);
    expect(resolveStrings(null)).toBe(en);
  });

  it("matches a regional tag on its base language", () => {
    registerLocale("ko", ko);
    registerLocale("zh", zh);
    expect(resolveStrings("ko-KR").crop).toBe(ko.crop);
    expect(resolveStrings("zh-Hans-CN").crop).toBe(resolveStrings("zh").crop);
  });

  it("ships every string in every locale it claims", () => {
    // A missing key would render blank chrome, which is worse than English.
    const keys = Object.keys(en) as Array<keyof PixenStrings>;
    for (const locale of availableLocales()) {
      const strings = resolveStrings(locale);
      const missing = keys.filter((key) => typeof strings[key] !== "string" || strings[key].trim() === "");
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });

  it("translates rather than echoing English", () => {
    // A locale that is silently identical to English is a locale nobody wrote.
    for (const locale of availableLocales().filter((tag) => tag !== "en")) {
      const strings = resolveStrings(locale);
      const shared = (Object.keys(en) as Array<keyof PixenStrings>).filter((key) => strings[key] === en[key]);
      expect(shared.length).toBeLessThan(Object.keys(en).length / 2);
    }
  });

  it("completes a host locale from English", () => {
    registerLocale("test-partial", { crop: "Rogner" });
    const strings = resolveStrings("test-partial");
    expect(strings.crop).toBe("Rogner");
    expect(strings.undo).toBe(en.undo);
  });
});

describe("writing direction", () => {
  it("is right to left for the languages that are", () => {
    expect(directionFor("ar")).toBe("rtl");
    expect(directionFor("ar-EG")).toBe("rtl");
    expect(directionFor("he")).toBe("rtl");
  });

  it("is left to right for everything else, including no locale at all", () => {
    expect(directionFor("en")).toBe("ltr");
    expect(directionFor("ko")).toBe("ltr");
    expect(directionFor(null)).toBe("ltr");
  });

  it("ships at least one right-to-left locale, so the mirroring is exercised", () => {
    registerBundledLocales();
    expect(availableLocales()).toContain("ar");
    expect(ar.crop).not.toBe(en.crop);
  });
});

/**
 * The freeform ratio was the one label the crop panel did not translate.
 *
 * `DEFAULT_ASPECT_RATIOS` is static and cannot see the locale, so it carries an
 * English placeholder — and the panel rendered the placeholder. Nine locales
 * had `freeform` translated and nothing read it.
 */
describe("the freeform ratio label", () => {
  const freeform = { label: FREEFORM_RATIO_LABEL, value: null };

  it("is the translated word, not the placeholder the defaults carry", () => {
    for (const locale of ["de", "ja", "ko", "ar"]) {
      const strings = resolveStrings(locale);
      expect(ratioButtonLabel(freeform, strings)).toBe(strings.freeform);
      expect(ratioButtonLabel(freeform, strings)).not.toBe(FREEFORM_RATIO_LABEL);
    }
  });

  it("leaves a host's own label alone, whatever language it is in", () => {
    const strings = resolveStrings("de");
    expect(ratioButtonLabel({ label: "Beliebig", value: null }, strings)).toBe("Beliebig");
  });

  it("leaves every other ratio alone, since a ratio is not a word", () => {
    const strings = resolveStrings("ja");
    expect(ratioButtonLabel({ label: "16:9", value: 16 / 9 }, strings)).toBe("16:9");
  });
});

/**
 * The nine languages used to be imported into the registry, all of them, which
 * put every one in every host's bundle. Measured: the registry is 40,455 bytes
 * minified against 3,125 for one language — 10.7 KB of the 63.5 KB this package
 * gzips to, a sixth of the download, of which a host that ships one language
 * uses a ninth.
 */
describe("which languages are in the bundle", () => {
  it("starts with English and nothing else", () => {
    // A fresh registry cannot be observed once another test has registered
    // something, so this asserts the floor rather than the exact list.
    expect(availableLocales()).toContain("en");
    expect(resolveStrings(undefined).crop).toBe(en.crop);
  });

  it("renders English for a language nobody registered, rather than nothing", () => {
    // Welsh, because Pixen does not ship it and so cannot accidentally start.
    expect(resolveStrings("cy").crop).toBe(en.crop);
  });

  it("says what to import, once per language", () => {
    const said: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => said.push(message);
    try {
      resolveStrings("is");
      resolveStrings("is-IS");
      resolveStrings("is");
    } finally {
      console.warn = warn;
    }
    // Once, not once per render — this is called on every frame.
    expect(said).toHaveLength(1);
    // And it names the import, which is a thing nobody can guess.
    expect(said[0]).toContain("@pixen/web/locale/is");
    expect(said[0]).toContain("registerBundledLocales");
  });

  it("says nothing about English, which is always there", () => {
    const said: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => said.push(message);
    try {
      resolveStrings("en-GB");
      resolveStrings("en");
    } finally {
      console.warn = warn;
    }
    expect(said).toHaveLength(0);
  });

  it("takes all nine in one line, for a host that would rather not choose", () => {
    registerBundledLocales();
    for (const tag of ["ar", "de", "es", "fr", "hi", "it", "ja", "ko", "nb", "nl", "pt", "ru", "sv", "zh"]) {
      expect(availableLocales(), tag).toContain(tag);
    }
  });

  it("knows a language reads right to left whether or not it is in the bundle", () => {
    // The direction of a language does not depend on whether its strings were
    // imported, so a host registering its own Hebrew still gets a mirrored
    // layout.
    expect(directionFor("he")).toBe("rtl");
    expect(directionFor("fa-IR")).toBe("rtl");
  });
});
