import { describe, expect, it } from "vitest";
import { configSnippet, type PlaygroundSettings } from "../../apps/playground/src/config.js";

/**
 * The playground's headline promise is "copy the configuration that produces
 * what you set up". A snippet that does not reproduce what is on screen is
 * worse than no snippet: it is a wrong answer someone will paste into their own
 * application and then debug.
 */
function settings(over: Partial<PlaygroundSettings> = {}): PlaygroundSettings {
  return { theme: "dark", locale: "en", format: "", quality: "0.82", preset: "", ...over };
}

describe("configSnippet", () => {
  it("always carries the source, the theme and the quality", () => {
    const snippet = configSnippet(settings());
    expect(snippet).toContain('src="/photo.jpg"');
    expect(snippet).toContain('theme="dark"');
    expect(snippet).toContain('quality="0.82"');
  });

  it("leaves out the locale the element already assumes", () => {
    expect(configSnippet(settings())).not.toContain("locale=");
    expect(configSnippet(settings({ locale: "ko" }))).toContain('locale="ko"');
  });

  it("leaves out a format the picker did not set, because the element matches the source", () => {
    expect(configSnippet(settings())).not.toContain("format=");
    expect(configSnippet(settings({ format: "image/jpeg" }))).toContain('format="image/jpeg"');
  });

  it("leaves out a preset that is not chosen", () => {
    expect(configSnippet(settings())).not.toContain("preset=");
    expect(configSnippet(settings({ preset: "profile" }))).toContain('preset="profile"');
  });

  it("shows the headless call as well, since the engine works without the UI", () => {
    const snippet = configSnippet(settings());
    expect(snippet).toContain("await processImage(file, {");
  });

  it("crops the headless example square for a profile picture, and caps it otherwise", () => {
    expect(configSnippet(settings({ preset: "profile" }))).toContain("width: 1024,");
    expect(configSnippet(settings({ preset: "profile" }))).toContain("height: 1024,");
    expect(configSnippet(settings({ preset: "profile" }))).not.toContain("maxWidth");
    expect(configSnippet(settings())).toContain("maxWidth: 1600,");
  });

  it("names a real format in the headless call even when the picker says match-source", () => {
    // `processImage` has no element to inherit from, so an empty string there
    // would be a snippet that does not run.
    expect(configSnippet(settings())).toContain('format: "image/webp",');
    expect(configSnippet(settings({ format: "image/png" }))).toContain('format: "image/png",');
  });

  it("closes the element it opened", () => {
    const snippet = configSnippet(settings());
    expect(snippet).toContain("<pixen-image-editor");
    expect(snippet).toContain("></pixen-image-editor>");
  });
});
