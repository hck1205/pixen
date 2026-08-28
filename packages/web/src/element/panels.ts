import type { PixenStrings } from "../i18n/index.js";

/** Which inspector panel is open. */
export type PanelId = "tool" | "adjust" | "layers" | "output";

/**
 * What a panel is called when it opens.
 *
 * The tool panel has no name of its own — it is whichever tool is armed — so it
 * is announced by the tool instead, which is why this is nullable rather than a
 * string everywhere.
 */
export const PANEL_LABEL_KEYS: Record<PanelId, keyof PixenStrings | null> = {
  tool: null,
  adjust: "adjustments",
  layers: "layers",
  output: "output",
};
