import { toPixenError, type Editor, type PixenError } from "@pixen/core";
import type { StickerDefinition, StickerToolOptions, ToolDefinition } from "../tools/index.js";

/**
 * Placing a host's stickers.
 *
 * What a sticker *is* is the host's business (`tools/stickers.ts` normalises
 * whatever they pass); what happens when one is chosen is the element's, and it
 * is this: decode it once, remember the resource, and hand it to the engine.
 *
 * The cache is the reason this is a class rather than a function. Placing the
 * same artwork ten times should decode it once and leave the document holding
 * ten references to one bitmap.
 */
export interface StickerPorts {
  readonly editor: Editor;
  /** The tool list, read for the sticker tool's options. */
  tools(): readonly ToolDefinition[];
  /** Announced in the live region once a sticker lands. */
  announce(message: string): void;
  fail(error: PixenError): void;
}

export class StickerPlacer {
  #ports: StickerPorts;
  /** Sticker id -> resource id. */
  #resources = new Map<string, string>();

  constructor(ports: StickerPorts) {
    this.#ports = ports;
  }

  /**
   * Loads a sticker if it is new, then drops it in the middle of the visible
   * crop, selected — because the next thing anyone does with a sticker is move
   * or resize it, and its handles are how.
   */
  async place(sticker: StickerDefinition): Promise<void> {
    const { editor } = this.#ports;
    if (!editor.ready) return;

    try {
      const known = this.#resources.get(sticker.id);
      const resource = known ? editor.resources.require(known) : await editor.resources.load(sticker.src);
      this.#resources.set(sticker.id, resource.id);

      editor.addSticker({
        resourceId: resource.id,
        size: { width: resource.width, height: resource.height },
        name: sticker.label,
        ...(this.#scale() === undefined ? {} : { scale: this.#scale()! }),
      });
      this.#ports.announce(sticker.label);
    } catch (cause) {
      this.#ports.fail(toPixenError(cause, "DECODE_FAILED", "The sticker could not be loaded"));
    }
  }

  /** How big a placed sticker is, if the host configured the tool. */
  #scale(): number | undefined {
    const options = this.#ports.tools().find((tool) => tool.id === "sticker")?.options as
      | StickerToolOptions
      | undefined;
    return typeof options?.scale === "number" ? options.scale : undefined;
  }

  /** Forgets the cache; the resources themselves belong to the engine. */
  clear(): void {
    this.#resources.clear();
  }
}
