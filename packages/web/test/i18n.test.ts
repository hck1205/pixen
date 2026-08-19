import { describe, expect, it } from "vitest";
import { ar, availableLocales, directionFor, en, ko, registerLocale, resolveStrings } from "../src/i18n/index.js";
import type { PixenStrings } from "../src/i18n/types.js";

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
