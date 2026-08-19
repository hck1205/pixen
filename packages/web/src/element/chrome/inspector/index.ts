import { divider, hint } from "../../dom/index.js";
import type { ChromeBuild, ChromeContext } from "../context.js";
import { buildAdjustmentControls } from "./adjustments.js";
import { buildCropControls } from "./crop.js";
import { buildFrameControls } from "./frame.js";
import { buildLayerControls } from "./layer.js";
import { buildRedactionControls } from "./redaction.js";
import { buildStickerControls } from "./sticker.js";
import { inspectorSectionFor } from "./sections.js";
import { buildStyleControls } from "./style.js";
import { buildViewControls } from "./view.js";

export * from "./sections.js";
export { buildRedactionControls } from "./redaction.js";
export { recolourPatch } from "./style.js";

/**
 * The inspector: whatever the active tool needs, then the view controls.
 *
 * Which section appears is decided by `inspectorSectionFor`, a pure function, so
 * this module only has to know how to build each one.
 */
export function buildInspector(context: ChromeContext): ChromeBuild {
  const view = buildViewControls(context);
  return {
    nodes: [...buildContextualControls(context), divider(), ...view.nodes],
    readouts: view.readouts,
  };
}

function buildContextualControls(context: ChromeContext): Node[] {
  const { strings, editor } = context;
  const selected = editor.ready ? editor.selectedLayer : null;

  const section = inspectorSectionFor({
    panel: context.panel,
    tool: context.tool,
    hasSelection: selected !== null,
    redactionSelected: selected?.type === "redact",
  });

  switch (section) {
    case "adjustments":
      // The frame is a picture-level decision like the adjustments, so it lives
      // in the same panel rather than earning a tool of its own.
      return [...buildAdjustmentControls(context), divider(), ...buildFrameControls(context)];
    case "crop":
      return buildCropControls(context);
    case "layer":
      return selected ? buildLayerControls(context, selected) : [hint(strings.select)];
    case "select-hint":
      return [hint(strings.select)];
    case "text-hint":
      return [hint(strings.textPlaceholder), ...buildStyleControls(context, { includeWidth: false })];
    case "sticker":
      return buildStickerControls(context);
    case "redaction":
      return buildRedactionControls(context, selected?.type === "redact" ? selected : null);
    case "style":
      return buildStyleControls(context, { includeWidth: true });
  }
}
