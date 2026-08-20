import type { Editor } from "@pixen/core";
import { field, input } from "../../dom/index.js";
import type { SliderRange } from "../../constants.js";

/**
 * A slider whose drag is one undo step.
 *
 * Three sections had written this out — straighten, frame width, every
 * adjustment — and each carried its own copy of the rule that makes it correct:
 * open a transaction on pointer-down, commit on pointer-up, so a drag that
 * emits a change per pixel undoes as the one thing it was. A fourth section
 * that forgot the pair would have filled the history with a hundred steps, and
 * nothing would have caught it.
 *
 * The plain `input({ type: "range" })` is still there for sliders that are not
 * dragged into the document — the annotation style palette changes what the
 * *next* mark looks like, so there is nothing to undo.
 */
export interface TransactedSliderSpec {
  /** Labels the field, and names the undo step. They are the same thing. */
  label: string;
  /** `data-field`, which the browser suite and the readouts find it by. */
  field: string;
  range: SliderRange;
  value: number;
  onInput(value: number): void;
}

export function transactedSlider(editor: Editor, spec: TransactedSliderSpec): HTMLElement {
  return field(
    spec.label,
    input({
      type: "range",
      ...spec.range,
      value: String(spec.value),
      dataset: { field: spec.field },
      onInput: (value) => spec.onInput(Number(value)),
      onPointerDown: () => editor.beginTransaction(spec.label),
      onPointerUp: () => editor.commitTransaction(),
    }),
  );
}
