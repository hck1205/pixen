/**
 * @pixen/web — the `<pixen-image-editor>` custom element.
 *
 * Importing this module registers the element. Everything it renders is driven
 * by an `@pixen/core` Editor instance, which stays reachable as `element.editor`
 * for hosts that want the headless API alongside the UI.
 *
 * The source is grouped by concern rather than by file type:
 *
 *   element/    the custom element, its chrome, its DOM helpers, its input
 *   viewport/   the canvas, gestures, overlay geometry and view fitting
 *   tools/      what a tool is, and how new annotations look
 *   i18n/       the strings, one module per locale
 *   theme/      styles and icons
 */
// Side-effect import: importing this package registers the custom element.
import "./define.js";

export { PixenImageEditorElement } from "./element/index.js";
export { definePixenImageEditor, TAG_NAME } from "./define.js";

export * from "./element/index.js";
export * from "./viewport/index.js";
export * from "./tools/index.js";
export * from "./bindings/index.js";
export {
  availableLocales,
  directionFor,
  registerLocale,
  resolveStrings,
  type PixenStrings,
} from "./i18n/index.js";
export { styles as pixenStyles, icons, type IconName } from "./theme/index.js";

declare global {
  interface HTMLElementTagNameMap {
    "pixen-image-editor": import("./element/index.js").PixenImageEditorElement;
  }
}
