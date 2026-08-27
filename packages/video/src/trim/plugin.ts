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
import type { ClipBounds } from "@pixen/core";
import type { PixenPlugin } from "@pixen/web";
import { TRIM_STRINGS } from "./strings.js";
import { buildTrimStrip, trimStyleElement, trimmableDuration, type TrimMark } from "./strip.js";

/**
 * The strip, with a length the host requires of a clip.
 *
 * A bound is on the *kept* length, not on what may be loaded: a source longer
 * than `max` opens as it always did, and the handles stop rather than the file
 * being refused. Somewhere to upload a thirty-second advert to is the case.
 *
 * ```js
 * editor.use(createTrimPlugin({ max: 30 }));
 * ```
 */
export function createTrimPlugin(bounds: ClipBounds = {}): PixenPlugin {
  return (context) => {
    const text = context.addStrings(TRIM_STRINGS);
    // Where the handles are, which outlives a rebuild: the section is rebuilt
    // on every document change, so the mark cannot live in the DOM it is drawn
    // into. It belongs to the installed plugin, whose lifetime is how long the
    // strip is on screen.
    const mark: TrimMark = { range: null };
    const style = trimStyleElement();
    context.element.shadowRoot?.append(style);

    const remove = context.addInspectorSection({
      id: "pixen-video-trim",
      // A still picture has no clip, and a strip over one would be a control
      // that does nothing rather than one that is merely disabled.
      when: () => trimmableDuration(context.editor) !== null,
      build: () => buildTrimStrip(context.editor, text, bounds, mark),
    });

    return () => {
      remove();
      style.remove();
    };
  };
}

/** The strip with no length rule, which is what most hosts want. */
export const trimPlugin: PixenPlugin = createTrimPlugin();
