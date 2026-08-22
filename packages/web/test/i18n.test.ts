import { describe, expect, it } from "vitest";
import { ar, availableLocales, directionFor, en, ko, registerLocale, resolveStrings } from "../src/i18n/index.js";
import type { PixenStrings } from "../src/i18n/types.js";
import { FREEFORM_RATIO_LABEL } from "../src/element/constants.js";
import { ratioButtonLabel } from "../src/element/ratios.js";

describe("locale resolution", () => {
  it("falls back to English for an unknown tag", () => {
    expect(resolveStrings("xx")).toBe(en);
    expect(resolveStrings(null)).toBe(en);
  });

  it("matches a regional tag on its base language", () => {
    expect(resolveStrings("ko-KR")).toBe(ko);
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
