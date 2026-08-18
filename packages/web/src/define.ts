import { PixenImageEditorElement } from "./element.js";

export const TAG_NAME = "pixen-image-editor";

/** Registers the element once; safe to import from several entry points. */
export function definePixenImageEditor(tagName: string = TAG_NAME): void {
  if (typeof customElements === "undefined") return;
  if (customElements.get(tagName)) return;
  customElements.define(tagName, PixenImageEditorElement);
}

definePixenImageEditor();
