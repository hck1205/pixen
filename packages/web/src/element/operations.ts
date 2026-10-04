import {
  applyPolicy,
  isPixenError,
  PixenError,
  type DecodeOptions,
  type Editor,
  type ExportOptions,
  type ExportResult,
  type ImagePolicy,
  type PresetName,
} from "@pixen/core";
import { applyAttribute, type AttributePorts } from "./attributes.js";
import type { BusyIndicator } from "./busy.js";
import { OUTPUT_ATTRIBUTES } from "./attributes.js";

/**
 * The three calls that take time.
 *
 * Loading, replacing the pixels and exporting are the element's only genuinely
 * slow operations, and each of them has to hold the busy state for exactly as
 * long as it runs and no longer. Loading has a rule of its own on top — see
 * `load` — which is the reason these three live together rather than among the
 * getters and setters: the token is state, and it belongs next to the thing it
 * guards rather than among the element's own fields.
 */
export interface OperationPorts {
  readonly editor: Editor;
  readonly busy: BusyIndicator;
  /** The decode options the host set on the element. */
  decodeOptions(): DecodeOptions;
  /** The policy in force, or null. Read per load, since it can change between them. */
  policy(): ImagePolicy | PresetName | null;
  /**
   * The ratio the crop tool was configured with, or undefined when the host
   * named none. See `CropToolOptions.defaultRatio`.
   */
  defaultAspectRatio(): number | null | undefined;
  /** For re-applying the output attributes to a freshly loaded picture. */
  attributePorts(): AttributePorts;
  attribute(name: string): string | null;
  emit(type: string, detail: unknown): void;
  /** The chrome is out of date once any of these finishes. */
  refresh(): void;
  invalidate(): void;
}

export class EditorOperations {
  #ports: OperationPorts;
  #loadToken = 0;

  constructor(ports: OperationPorts) {
    this.#ports = ports;
  }

  /**
   * The token is not the same guard as the engine's.
   *
   * The engine aborts a superseded decode, which stops it wasting work. This
   * stops the *continuation* of a superseded load — applying the policy, the
   * format, the busy state — from running against an editor that has moved on.
   * Both are needed; neither replaces the other.
   */
  async load(input: Parameters<Editor["load"]>[0], options?: DecodeOptions): Promise<void> {
    const ports = this.#ports;
    const token = ++this.#loadToken;
    ports.busy.begin("load");
    try {
      await ports.editor.load(input, { ...ports.decodeOptions(), ...options });
      // A newer load started while this one was decoding: drop the stale result.
      if (token !== this.#loadToken) return;
      const policy = ports.policy();
      if (policy) applyPolicy(ports.editor, policy);
      // What the crop tool was configured with. Undefined means the host said
      // nothing, which is not the same as asking for freeform.
      const ratio = ports.defaultAspectRatio();
      if (ratio !== undefined) ports.editor.setAspectRatio(ratio);
      // The rules the attributes carry, not a second copy of them.
      for (const name of OUTPUT_ATTRIBUTES) applyAttribute(name, ports.attribute(name), ports.attributePorts());
      ports.emit("pixen-load", { document: ports.editor.toJSON() });
    } catch (error) {
      // The editor already emitted this failure; only surface errors raised
      // after the load itself (policy application, attribute parsing).
      if (token === this.#loadToken && !isPixenError(error)) {
        ports.emit("pixen-error", {
          error: new PixenError("INVALID_IMAGE", "The image could not be loaded", { cause: error }),
        });
      }
    } finally {
      if (token === this.#loadToken) {
        ports.busy.end();
        ports.refresh();
      }
    }
  }

  /**
   * Swaps the pixels under the current edit, keeping the edit. The host round
   * trip this exists for — a background remover, an upscaler — is slow and
   * invisible, so the busy state is held for its duration.
   */
  async replaceSource(input: Parameters<Editor["replaceSource"]>[0]): Promise<void> {
    const ports = this.#ports;
    ports.busy.begin("load");
    try {
      await ports.editor.replaceSource(input);
      ports.invalidate();
      ports.refresh();
    } catch {
      // Already on the engine's error channel; a second one would double-count.
    } finally {
      ports.busy.end();
    }
  }

  async export(options: ExportOptions = {}): Promise<ExportResult> {
    const ports = this.#ports;
    // `pixen-export` is forwarded from the engine, so a host's own export
    // reaches the same listeners as this one.
    ports.busy.begin("export");
    try {
      return await ports.editor.export(options);
    } finally {
      ports.busy.end();
    }
  }
}
