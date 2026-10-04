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

/**
 * `defaultRatio` was documented on `CropToolOptions` and read by nothing: a host
 * that set it got a freeform crop and no sign that the option had been ignored.
 * The type it describes was unused too — the settings re-declared the shape
 * inline — which is how the two drifted apart in the first place.
 */
describe("the ratio a picture loads at", () => {
  it("is what the host asked for", () => {
    expect(cropToolSettings([{ id: "crop", options: { defaultRatio: 16 / 9 } }]).defaultRatio).toBe(16 / 9);
  });

  it("tells freeform apart from unset, since a host can ask for freeform", () => {
    // null is a choice; undefined is silence, and only silence leaves the
    // document's own ratio alone.
    expect(cropToolSettings([{ id: "crop", options: { defaultRatio: null } }])).toHaveProperty("defaultRatio", null);
    expect(cropToolSettings([{ id: "crop", options: {} }])).not.toHaveProperty("defaultRatio");
    expect(cropToolSettings([{ id: "crop" }])).not.toHaveProperty("defaultRatio");
  });
});
