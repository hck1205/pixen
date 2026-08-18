/**
 * @pixen/web — the `<pixen-image-editor>` custom element.
 *
 * Importing this module registers the element. Everything it renders is driven
 * by an `@pixen/core` Editor instance, which stays reachable as `element.editor`
 * for hosts that want the headless API alongside the UI.
 */
// Side-effect import: importing this package registers the custom element.
import "./define.js";

export { PixenImageEditorElement, type AspectRatioOption } from "./element.js";
export { definePixenImageEditor, TAG_NAME } from "./define.js";
export { styles as pixenStyles } from "./styles.js";
export { icons, type IconName } from "./icons.js";
export { en, ko, registerLocale, resolveStrings, type PixenStrings } from "./i18n.js";
export {
  DEFAULT_STYLE,
  DEFAULT_TOOLS,
  normaliseTools,
  type AnnotationStyle,
  type CropToolOptions,
  type ToolDefinition,
  type ToolId,
} from "./tools.js";
export { Viewport, type ViewportCallbacks } from "./viewport.js";
export * from "./gestures.js";
export * from "./overlay.js";

declare global {
  interface HTMLElementTagNameMap {
    "pixen-image-editor": import("./element.js").PixenImageEditorElement;
  }
}
