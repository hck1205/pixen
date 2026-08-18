import { divider, hint } from "../../dom/index.js";
import type { ChromeBuild, ChromeContext } from "../context.js";
import { buildAdjustmentControls } from "./adjustments.js";
import { buildCropControls } from "./crop.js";
import { buildLayerControls } from "./layer.js";
import { inspectorSectionFor } from "./sections.js";
import { buildStyleControls } from "./style.js";
import { buildViewControls } from "./view.js";

export * from "./sections.js";
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
  });

  switch (section) {
    case "adjustments":
      return buildAdjustmentControls(context);
    case "crop":
      return buildCropControls(context);
    case "layer":
      return selected ? buildLayerControls(context, selected) : [hint(strings.select)];
    case "select-hint":
      return [hint(strings.select)];
    case "text-hint":
      return [hint(strings.textPlaceholder), ...buildStyleControls(context, { includeWidth: false })];
    case "redact-hint":
      return [hint(strings.redact), ...buildStyleControls(context, { includeWidth: false })];
    case "style":
      return buildStyleControls(context, { includeWidth: true });
  }
}
