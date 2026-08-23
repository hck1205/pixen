/**
 * The trim strip, installed the way the extension is sold.
 *
 * A plugin rather than part of the editor, because this package is bought
 * separately — and the first thing that proved was that a plugin had no way to
 * carry its own labels. `addStrings` is that seam, and this is its first
 * customer.
 *
 * ```js
 * import { trimPlugin } from "@pixen/video";
 * editor.use(trimPlugin);
 * ```
 */
import type { PixenPlugin } from "@pixen/web";
import { TRIM_STRINGS } from "./strings.js";
import { buildTrimStrip, trimStyleElement, trimmableDuration } from "./strip.js";

export const trimPlugin: PixenPlugin = (context) => {
  const text = context.addStrings(TRIM_STRINGS);
  const style = trimStyleElement();
  context.element.shadowRoot?.append(style);

  const remove = context.addInspectorSection({
    id: "pixen-video-trim",
    // A still picture has no clip, and a strip over one would be a control that
    // does nothing rather than one that is merely disabled.
    when: () => trimmableDuration(context.editor) !== null,
    build: () => buildTrimStrip(context.editor, text),
  });

  return () => {
    remove();
    style.remove();
  };
};
