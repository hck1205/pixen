import type { CropHandle } from "../../geometry/crop.js";
import type { Point, Rect } from "../../geometry/types.js";
import type { ResizeIntent } from "../../image/resize.js";
import type { ClipBounds, ClipRange, ClipSelection } from "../../model/clip.js";
import type { LayerHandle } from "../../model/transform.js";
import type {
  Adjustments,
  EditorDocument,
  EditorLayer,
  FrameSettings,
  OutputSettings,
} from "../../model/types.js";
import type { HistorySummary } from "../history.js";
import type { StepName } from "./steps.js";

/**
 * The vocabulary of an edit, and what each word means as a change to the
 * document.
 *
 * Nothing here knows about history, selection or transactions — only which
 * command an intent stands for. Keeping the table separate from the machine
 * that runs it means "what does rotate-right do" is answerable without
 * constructing a session.
 */
/**
 * Intents are data, which is what makes them easy to test, log, queue and
 * replay. The single exception is `transform`, the escape hatch a plugin needs
 * to apply a command this union does not know about.
 */
export type Intent =
  | { kind: "rotate-by"; radians: number }
  | { kind: "rotate-quarter-turns"; turns: number }
  | { kind: "straighten"; radians: number }
  | { kind: "flip"; axis: "x" | "y" }
  | { kind: "set-crop"; rect: Rect | null }
  | { kind: "drag-crop-handle"; handle: CropHandle; pointer: Point; minSize?: number }
  | { kind: "pan-crop"; delta: Point }
  | { kind: "set-aspect-ratio"; ratio: number | null }
  | {
      kind: "set-clip";
      range: ClipSelection | ClipRange | null;
      /** How long the host will let a clip be. See `ClipBounds`. */
      bounds?: ClipBounds;
    }
  | { kind: "set-adjustments"; adjustments: Partial<Adjustments> }
  | { kind: "set-output"; output: Partial<OutputSettings> }
  | { kind: "set-frame"; frame: Partial<FrameSettings> | null }
  | { kind: "resize"; resize: ResizeIntent }
  | { kind: "add-layer"; layer: EditorLayer; index?: number; select?: boolean }
  | { kind: "update-layer"; id: string; patch: Partial<EditorLayer> }
  | { kind: "move-layer"; id: string; delta: Point }
  | {
      kind: "drag-layer-handle";
      id: string;
      handle: LayerHandle;
      pointer: Point;
      minSize?: number;
      aspectRatio?: number | null;
      snap?: number;
    }
  | { kind: "set-crop-within-image"; within: boolean }
  | { kind: "set-colour-matrix"; matrix: readonly number[] | null }
  | { kind: "reorder-layer"; id: string; index: number }
  | { kind: "remove-layer"; id: string }
  | { kind: "select"; id: string | null }
  | { kind: "reset" }
  | { kind: "set-document"; document: EditorDocument }
  | {
      kind: "transform";
      reason: string;
      transform: (document: EditorDocument) => EditorDocument;
      /** Wording of the host's own, used exactly as given. */
      label?: string;
      /** Or one of the engine's own steps, which a locale can translate. */
      step?: StepName;
      silent?: boolean;
    }
  | { kind: "begin-transaction"; label: string; step?: StepName }
  | { kind: "commit-transaction" }
  | { kind: "rollback-transaction" }
  | { kind: "undo" }
  | { kind: "redo" };

export type IntentKind = Intent["kind"];

export type SessionEvent =
  | { type: "change"; document: EditorDocument; reason: string; transient: boolean }
  | { type: "selection"; id: string | null }
  | { type: "history"; summary: HistorySummary };
