/**
 * What a step in the history is called.
 *
 * The engine names a step; it does not word it. An undo button that says what
 * it will undo is the difference between a guess and a decision, and it was
 * saying it in English in every language — "실행취소: Crop", because the verb
 * came from the locale and the step came from here.
 *
 * So a step carries a name from this list, and the English below is what a host
 * with no locale machinery gets. `@pixen/web` translates the name; anything
 * that does not, falls back to these.
 *
 * A label a host supplies itself — through `transact`, `mutate` or a `transform`
 * intent — has no name here and is used exactly as given. It is their wording,
 * and translating it is not ours to do.
 */
export type StepName =
  | "rotate"
  | "straighten"
  | "flipHorizontal"
  | "flipVertical"
  | "crop"
  | "resetCrop"
  | "moveCrop"
  | "trim"
  | "resetTrim"
  | "aspectRatio"
  | "cropArea"
  | "adjust"
  | "output"
  | "frame"
  | "resize"
  | "addLayer"
  | "editLayer"
  | "moveLayer"
  | "moveLayerHandle"
  | "rotateLayer"
  | "reorderLayer"
  | "deleteLayer"
  | "reset"
  | "replaceDocument"
  | "replaceImage"
  | "applyEdits";

/** The reference wording, and the fallback for anything that cannot translate. */
export const STEP_LABELS: Record<StepName, string> = {
  rotate: "Rotate",
  straighten: "Straighten",
  flipHorizontal: "Flip horizontal",
  flipVertical: "Flip vertical",
  crop: "Crop",
  resetCrop: "Reset crop",
  moveCrop: "Move crop",
  trim: "Trim",
  resetTrim: "Reset trim",
  aspectRatio: "Aspect ratio",
  cropArea: "Crop area",
  adjust: "Adjust",
  output: "Output settings",
  frame: "Frame",
  resize: "Resize",
  addLayer: "Add annotation",
  editLayer: "Edit annotation",
  moveLayer: "Move annotation",
  moveLayerHandle: "Resize annotation",
  rotateLayer: "Rotate annotation",
  reorderLayer: "Reorder annotation",
  deleteLayer: "Delete annotation",
  reset: "Reset",
  replaceDocument: "Replace document",
  replaceImage: "Replace image",
  applyEdits: "Apply edits",
};

/** Every step name, for anything that has to cover them all. */
export const STEP_NAMES = Object.keys(STEP_LABELS) as readonly StepName[];

/** Whether a string is one of the engine's own step names. */
export function isStepName(name: string): name is StepName {
  return Object.hasOwn(STEP_LABELS, name);
}
