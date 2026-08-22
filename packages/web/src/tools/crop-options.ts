import { DEFAULT_MIN_CROP_SIZE } from "@pixen/core";
import type { CropToolOptions, ToolDefinition } from "./types.js";

/**
 * What the crop tool was configured with, read out of the tool list.
 *
 * A decision rather than a lookup, and it is here rather than inside a setter
 * because of when it has to be asked. The element used to read `minSize` once,
 * while assigning `tools`, and apply it to the viewport if there happened to be
 * one — so a host that configured the editor before it was in the document had
 * its crop floor silently dropped, and a component moved in the DOM lost it
 * again, because `connectedCallback` builds a fresh `Viewport` that starts at
 * the default.
 *
 * Asked on connect as well as on assignment, it cannot be lost either way.
 *
 * The unit tests below cover the decision. What is *not* covered is the moved-in-
 * the-DOM path end to end: the floor only takes effect inside a real pointer
 * gesture — `editor.dragCropHandle` carries its own minimum — and this suite has
 * no pointer-drag helper to build that on. Worth adding with one.
 */
export interface CropToolSettings {
  ratios?: (number | null)[];
  /**
   * The ratio to lock a freshly loaded picture to, if the host named one.
   *
   * Undefined and null are different answers: null is "freeform", which a host
   * can ask for deliberately, and undefined is "the host said nothing" — so it
   * cannot be flattened to a default here.
   */
  defaultRatio?: number | null;
  minSize: number;
}

export function cropToolSettings(tools: readonly ToolDefinition[]): CropToolSettings {
  const options = tools.find((tool) => tool.id === "crop")?.options as CropToolOptions | undefined;

  return {
    ...(options?.ratios ? { ratios: options.ratios } : {}),
    ...("defaultRatio" in (options ?? {}) ? { defaultRatio: options?.defaultRatio } : {}),
    // A host that asked for nothing gets the default rather than whatever the
    // last tool list left behind on a viewport that outlived it.
    minSize: options?.minSize ?? DEFAULT_MIN_CROP_SIZE,
  };
}
