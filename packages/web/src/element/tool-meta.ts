import type { PixenStrings } from "../i18n/index.js";
import type { IconName } from "../theme/index.js";
import type { ToolId } from "../tools/index.js";

/**
 * How each tool appears and how it is reached.
 *
 * Beside `tools/definitions.ts`, which says which tools exist and in what
 * order, rather than inside it: this is what the chrome needs to draw one and
 * what the keyboard needs to arm one, and neither is part of what a tool *is*.
 */
export interface ToolMeta {
  icon: IconName;
  key: keyof PixenStrings;
  /** Single-key shortcut, lower case. */
  shortcut: string;
}

export const TOOL_META: Readonly<Record<ToolId, ToolMeta>> = {
  crop: { icon: "crop", key: "crop", shortcut: "c" },
  select: { icon: "select", key: "select", shortcut: "v" },
  rect: { icon: "rectangle", key: "rectangle", shortcut: "r" },
  ellipse: { icon: "ellipse", key: "ellipse", shortcut: "o" },
  arrow: { icon: "arrow", key: "arrow", shortcut: "a" },
  draw: { icon: "draw", key: "draw", shortcut: "d" },
  text: { icon: "text", key: "text", shortcut: "t" },
  sticker: { icon: "sticker", key: "sticker", shortcut: "s" },
  redact: { icon: "redact", key: "redact", shortcut: "x" },
  retouch: { icon: "retouch", key: "retouch", shortcut: "h" },
};
