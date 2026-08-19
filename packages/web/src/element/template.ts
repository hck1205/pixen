import { styles } from "../theme/index.js";

/**
 * The shadow tree, written once.
 *
 * Every named slot and every `part` in here is public API: hosts style through
 * the parts and replace chrome through the slots, so renaming one is a breaking
 * change rather than a refactor.
 */
export function template(): string {
  return `<style>${styles}</style>
<div class="root" part="root">
  <canvas part="canvas"></canvas>
  <textarea class="text-input" part="text-input" spellcheck="false" hidden rows="1"></textarea>
  <div class="layer">
    <div class="top">
      <slot name="actions"><div class="cluster actions" part="actions" role="toolbar"></div></slot>
    </div>
    <div class="middle">
      <slot name="tools"><div class="cluster rail" part="tool-rail" role="toolbar"></div></slot>
    </div>
    <div class="bottom">
      <slot name="inspector"><div class="cluster inspector" part="inspector"></div></slot>
    </div>
  </div>
  <div class="empty" part="empty"></div>
  <div class="dropzone" part="dropzone" hidden></div>
  <div class="busy" part="busy" role="status" hidden></div>
  <div class="status sr-only" role="status" aria-live="polite"></div>
  <input type="file" accept="image/*" class="sr-only" tabindex="-1" aria-hidden="true">
</div>`;
}

/** The nodes the element keeps a handle on, found once when it connects. */
export const SELECTORS = {
  canvas: "canvas",
  rail: ".rail",
  actions: ".actions",
  inspector: ".inspector",
  empty: ".empty",
  dropzone: ".dropzone",
  busy: ".busy",
  status: ".status",
  fileInput: "input[type=file]",
  textInput: ".text-input",
} as const;
