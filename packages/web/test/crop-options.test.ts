import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_CROP_SIZE } from "@pixen/core";
import { cropToolSettings } from "../src/tools/crop-options.js";
import { normaliseTools } from "../src/tools/definitions.js";

/**
 * What the crop tool was configured with, as a decision rather than a lookup
 * inside a setter.
 *
 * It was the latter, and *when* it was asked is what went wrong: the element
 * read `minSize` once while assigning `tools` and applied it only if there
 * happened to be a viewport. Configure the editor before it is in the document
 * and the setting was dropped; move the component in the DOM and
 * `connectedCallback` built a fresh viewport at the default and nothing put it
 * back.
 */
describe("cropToolSettings", () => {
  it("reads the floor a host asked for", () => {
    expect(cropToolSettings(normaliseTools([{ id: "crop", options: { minSize: 200 } }])).minSize).toBe(200);
  });

  it("falls back to the default when the host asked for nothing", () => {
    // The default rather than "leave whatever was there": a viewport can outlive
    // the tool list that configured it, and inheriting a stale floor is how a
    // host ends up unable to crop small on a picture it never configured.
    expect(cropToolSettings(normaliseTools(["crop"])).minSize).toBe(DEFAULT_MIN_CROP_SIZE);
    expect(cropToolSettings(normaliseTools(null)).minSize).toBe(DEFAULT_MIN_CROP_SIZE);
  });

  it("is the default when there is no crop tool at all", () => {
    expect(cropToolSettings(normaliseTools(["rect", "text"])).minSize).toBe(DEFAULT_MIN_CROP_SIZE);
  });

  it("carries the ratios through, and leaves them out when unset", () => {
    expect(cropToolSettings(normaliseTools([{ id: "crop", options: { ratios: [1, null] } }])).ratios).toEqual([1, null]);
    expect(cropToolSettings(normaliseTools(["crop"])).ratios).toBeUndefined();
  });

  it("ignores options meant for another tool", () => {
    const tools = normaliseTools([{ id: "rect", options: { minSize: 999 } }, "crop"]);
    expect(cropToolSettings(tools).minSize).toBe(DEFAULT_MIN_CROP_SIZE);
  });
});
