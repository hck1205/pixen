import type { ImageFormat, PresetName } from "@pixen/core";
import type { ObservedAttribute } from "./constants.js";

/**
 * What each observed attribute means.
 *
 * The same shape as `runKeyboardAction`: the decision is a function over ports,
 * so "setting `quality` to 0.6 sets the output quality, and setting it before an
 * image is loaded does nothing" is answerable in a test rather than only in a
 * browser. The element supplies the ports and keeps the effects.
 */
export interface AttributePorts {
  /** True once there is a viewport to render a source into. */
  mounted(): boolean;
  /** True once there is a document for format and quality to apply to. */
  ready(): boolean;
  load(src: string): void;
  /** Hold a source until there is something to render it into. */
  defer(src: string): void;
  setFormat(format: ImageFormat): void;
  setQuality(quality: number): void;
  setLocale(locale: string | null): void;
  setPreset(preset: PresetName | null): void;
  /** Re-read state into the chrome; a theme is pure CSS and needs only this. */
  refresh(): void;
}

export function applyAttribute(
  name: ObservedAttribute,
  value: string | null,
  ports: AttributePorts,
): void {
  switch (name) {
    case "src":
      if (!value) return;
      // Before the viewport exists there is nothing to render into, so the
      // source waits for connectedCallback.
      return ports.mounted() ? ports.load(value) : ports.defer(value);
    case "locale":
      return ports.setLocale(value);
    case "format":
      if (ports.ready() && value) ports.setFormat(value as ImageFormat);
      return;
    case "quality":
      if (ports.ready() && value) ports.setQuality(Number(value));
      return;
    case "preset":
      return ports.setPreset((value as PresetName) || null);
    case "theme":
      return ports.refresh();
    default: {
      // Adding an observed attribute without handling it fails to compile.
      const unhandled: never = name;
      void unhandled;
    }
  }
}
