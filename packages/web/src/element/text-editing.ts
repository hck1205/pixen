import { findLayerOfType, type Editor, type Matrix } from "@pixen/core";
import { textBoxPlacement, textBoxStyle } from "../viewport/index.js";

/**
 * Editing a text layer where it sits.
 *
 * The custom element owns the shadow tree and the lifecycle; this owns the one
 * thing inside it with a life of its own — an input that appears over a layer,
 * follows it, and either commits or discards. Keeping it here means the element
 * does not have to hold "which layer is being typed into" among its own state,
 * and this can be read without opening the element at all.
 */
export interface TextEditingPorts {
  /** The input that stands in for the layer while it is edited. */
  readonly input: HTMLTextAreaElement;
  readonly editor: Editor;
  /** Image space to CSS pixels, or null while there is no viewport. */
  imageToScreen(): Matrix | null;
  /** Called after the editor closes, so focus can go back where it belongs. */
  onClosed(): void;
}

export class CanvasTextEditor {
  #ports: TextEditingPorts;
  #layerId: string | null = null;

  constructor(ports: TextEditingPorts) {
    this.#ports = ports;
  }

  /** The layer being edited, or null. */
  get editing(): string | null {
    return this.#layerId;
  }

  /** Wires the input's own events. Returns the function that unwires them. */
  attach(): () => void {
    const { input } = this.#ports;
    input.addEventListener("input", this.#onInput);
    input.addEventListener("blur", this.#onBlur);
    input.addEventListener("keydown", this.#onKeyDown);
    return () => {
      input.removeEventListener("input", this.#onInput);
      input.removeEventListener("blur", this.#onBlur);
      input.removeEventListener("keydown", this.#onKeyDown);
    };
  }

  /**
   * Opens the editor over a layer, and says whether it did.
   *
   * The transaction is *not* opened here: whoever asked for the editor opened
   * it — the text tool on creation, the viewport on a double-click — so that
   * creating a layer and typing into it collapse into one undo step.
   * Transactions do not nest, so there is exactly one owner.
   *
   * Which is why the answer matters. There are two ways not to open — a layer
   * that is not there, and a viewport with no matrix yet — and on both of them
   * the caller has already opened a transaction that nothing will ever close.
   * Returning false is how the caller learns to roll it back.
   */
  open(layerId: string): boolean {
    const { editor, input } = this.#ports;
    const layer = findLayerOfType(editor.document.layers, layerId, "text");
    if (!layer || this.#ports.imageToScreen() === null) return false;

    editor.select(layerId);
    this.#layerId = layerId;
    // Hidden while its editor is open, so there is exactly one copy of the text
    // on screen and the caret is in it.
    editor.updateLayer(layerId, { visible: false });

    input.value = layer.text;
    input.hidden = false;
    this.reposition();
    input.focus();
    input.setSelectionRange(layer.text.length, layer.text.length);
    return true;
  }

  /** Keeps the input over its layer while the view pans, zooms or resizes. */
  reposition(): void {
    const { editor, input } = this.#ports;
    const layer = findLayerOfType(editor.document.layers, this.#layerId, "text");
    const matrix = this.#ports.imageToScreen();
    if (!layer || !matrix) return;

    for (const [property, value] of Object.entries(textBoxStyle(textBoxPlacement(layer, matrix)))) {
      input.style.setProperty(property, value);
    }
    // A textarea does not grow by itself, and a scrollbar mid-sentence is worse
    // than a box that follows the text.
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }

  /** Commits the edit, or removes a layer that was left empty. */
  close(): void {
    const id = this.#layerId;
    if (!id) return;
    const { editor, input } = this.#ports;

    this.#layerId = null;
    input.hidden = true;

    const text = input.value;
    if (text.trim() === "") {
      // An empty text layer is invisible and unselectable, so it would be
      // litter rather than content.
      editor.removeLayer(id);
      editor.rollbackTransaction();
      return;
    }
    editor.updateLayer(id, { text, visible: true });
    editor.commitTransaction();
  }

  #onInput = (): void => {
    if (!this.#layerId) return;
    this.#ports.editor.updateLayer(this.#layerId, { text: this.#ports.input.value });
    this.reposition();
  };

  #onBlur = (): void => this.close();

  #onKeyDown = (event: KeyboardEvent): void => {
    // Enter adds a line, as it does in any text box. Escape closes. Everything
    // else belongs to the input, so it must not reach the canvas underneath.
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      this.#ports.onClosed();
      return;
    }
    event.stopPropagation();
  };
}
