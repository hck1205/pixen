import type { EditorDocument, ImagePolicy, PresetName } from "@pixen/core";
import type { PixenImageEditorElement } from "../element/index.js";
import type { AspectRatioOption } from "../element/constants.js";
import type { StickerDefinition, ToolInput } from "../tools/index.js";

/**
 * The structured settings a framework binds to the element.
 *
 * Scalars travel as attributes and need no help; these are objects and arrays,
 * which HTML attributes cannot carry, so every wrapper assigns them as
 * properties. Doing it here means the wrappers agree on what "assigning src"
 * means — an attribute for a URL, a decode for a Blob.
 */
export interface PixenElementProperties {
  src?: string | Blob | null;
  document?: EditorDocument | string | null;
  tools?: ToolInput[] | null;
  aspectRatios?: (number | null | AspectRatioOption)[] | null;
  policy?: ImagePolicy | PresetName | null;
  stickers?: (string | Blob | StickerDefinition)[] | null;
}

/** Applies one property. Undefined means "the host did not say", so nothing happens. */
export function applyProperty<K extends keyof PixenElementProperties>(
  element: PixenImageEditorElement,
  key: K,
  value: PixenElementProperties[K],
): void {
  if (value === undefined) return;

  switch (key) {
    case "src": {
      const src = value as PixenElementProperties["src"];
      if (!src) return;
      // A URL goes through the attribute so the element can dedupe reloads;
      // a Blob cannot, so it is loaded imperatively.
      if (typeof src === "string") element.setAttribute("src", src);
      else void element.load(src);
      return;
    }
    case "document": {
      const document = value as PixenElementProperties["document"];
      if (document) element.document = document;
      return;
    }
    case "tools": {
      const tools = value as PixenElementProperties["tools"];
      if (tools) element.tools = tools;
      return;
    }
    case "aspectRatios": {
      const ratios = value as PixenElementProperties["aspectRatios"];
      if (ratios) element.aspectRatios = ratios;
      return;
    }
    case "stickers": {
      const stickers = value as PixenElementProperties["stickers"];
      if (stickers) element.stickers = stickers;
      return;
    }
    case "policy":
      element.policy = (value ?? null) as ImagePolicy | PresetName | null;
      return;
  }
}

/** Applies every property a host supplied, in a stable order. */
export function applyProperties(element: PixenImageEditorElement, props: PixenElementProperties): void {
  applyProperty(element, "tools", props.tools);
  applyProperty(element, "aspectRatios", props.aspectRatios);
  applyProperty(element, "stickers", props.stickers);
  applyProperty(element, "policy", props.policy);
  applyProperty(element, "document", props.document);
  // Last, so the freshly configured element is what decodes the image.
  applyProperty(element, "src", props.src);
}
