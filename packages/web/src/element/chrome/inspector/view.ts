import { button, divider, readout } from "../../dom/index.js";
import { shortcutLabel, sizeLabel, zoomLabel } from "../../labels.js";
import { ZOOM_STEP } from "../../constants.js";
import type { ChromeBuild, ChromeContext } from "../context.js";

/**
 * Zoom and the output size.
 *
 * These belong to the viewport rather than to any one tool, so they stay put
 * while the rest of the inspector changes under them. The two readouts are
 * returned so the element can refresh their text during a drag without
 * rebuilding anything.
 */
export function buildViewControls(context: ChromeContext): ChromeBuild {
  const { strings, actions, apple, editor } = context;

  const zoom = readout(zoomLabel(context.zoom));
  const size = readout(editor.ready ? sizeLabel(editor.outputSize) : "—");
  const fitShortcut = shortcutLabel(apple, "0");

  return {
    nodes: [
      button({ icon: "zoomOut", label: strings.zoomOut, onClick: () => actions.zoomBy(1 / ZOOM_STEP) }),
      zoom,
      button({ icon: "zoomIn", label: strings.zoomIn, onClick: () => actions.zoomBy(ZOOM_STEP) }),
      button({ icon: "fit", label: `${strings.zoomFit} (${fitShortcut})`, onClick: actions.zoomToFit }),
      divider(),
      size,
    ],
    readouts: { zoom, size },
  };
}
