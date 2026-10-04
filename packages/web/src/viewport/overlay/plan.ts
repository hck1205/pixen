import { CROP_HANDLES, type CropHandle } from "@pixen/core";
import type { ToolId } from "../../tools/index.js";

/**
 * What the overlay is, for the state the editor is in.
 *
 * A pure lookup, like `inspectorSectionFor` next door: the crop tool owns the
 * canvas while it is armed, whatever else is selected, and everything else
 * shows the selected layer or nothing at all.
 */
export type OverlayPlan =
  | { kind: "crop" }
  | { kind: "selection"; grips: readonly CropHandle[]; rotate: boolean }
  | { kind: "none" };

export function planOverlay(tool: ToolId, selected: { locked: boolean } | null): OverlayPlan {
  if (tool === "crop") return { kind: "crop" };
  if (!selected) return { kind: "none" };
  // A locked layer still shows where it is; it just cannot be grabbed, so it
  // gets the outline and none of the things you would drag.
  if (selected.locked) return { kind: "selection", grips: [], rotate: false };
  return { kind: "selection", grips: CROP_HANDLES, rotate: true };
}
