import type { CropHandle } from "../../geometry/crop.js";
import type { Point, Rect } from "../../geometry/types.js";
import type { ResizeIntent } from "../../image/resize.js";
import { resolveSize } from "../../image/resize.js";
import { cloneDocument, effectiveCrop } from "../../model/document.js";
import type { LayerHandle } from "../../model/transform.js";
import type {
  Adjustments,
  EditorDocument,
  EditorLayer,
  FrameSettings,
  OutputSettings,
} from "../../model/types.js";
import * as commands from "../commands.js";
import type { HistorySummary } from "../history.js";

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
  | { kind: "reorder-layer"; id: string; index: number }
  | { kind: "remove-layer"; id: string }
  | { kind: "select"; id: string | null }
  | { kind: "reset" }
  | { kind: "set-document"; document: EditorDocument }
  | { kind: "transform"; reason: string; transform: (document: EditorDocument) => EditorDocument; label?: string; silent?: boolean }
  | { kind: "begin-transaction"; label: string }
  | { kind: "commit-transaction" }
  | { kind: "rollback-transaction" }
  | { kind: "undo" }
  | { kind: "redo" };

export type IntentKind = Intent["kind"];

export type SessionEvent =
  | { type: "change"; document: EditorDocument; reason: string; transient: boolean }
  | { type: "selection"; id: string | null }
  | { type: "history"; summary: HistorySummary };

/** A document-only change: which command runs, and how it appears in history. */
export interface DocumentChange {
  reason: string;
  label: string;
  transform: (document: EditorDocument) => EditorDocument;
  /** Mid-gesture steps are not their own undo entries. */
  silent?: boolean;
}

/**
 * The intent-to-command table. Keeping it a pure lookup means "what does
 * rotate-right do" has one answer, checkable without constructing an editor.
 */
export function documentChangeFor(intent: Intent): DocumentChange | null {
  switch (intent.kind) {
    case "rotate-by":
      return { reason: "rotate", label: "Rotate", transform: (d) => commands.rotateBy(d, intent.radians) };
    case "rotate-quarter-turns":
      return {
        reason: "rotate",
        label: "Rotate",
        transform: (d) => commands.rotateQuarterTurns(d, intent.turns),
      };
    case "straighten":
      return {
        reason: "straighten",
        label: "Straighten",
        transform: (d) => commands.straighten(d, intent.radians),
      };
    case "flip":
      return {
        reason: "flip",
        label: intent.axis === "x" ? "Flip horizontal" : "Flip vertical",
        transform: (d) => commands.flip(d, intent.axis),
      };
    case "set-crop":
      return {
        reason: "crop",
        label: intent.rect ? "Crop" : "Reset crop",
        transform: (d) => commands.setCrop(d, intent.rect),
      };
    case "drag-crop-handle":
      return {
        reason: "crop-drag",
        label: "Crop",
        transform: (d) => commands.dragCropHandle(d, intent.handle, intent.pointer, intent.minSize),
      };
    case "pan-crop":
      return { reason: "crop-pan", label: "Move crop", transform: (d) => commands.panCrop(d, intent.delta) };
    case "set-aspect-ratio":
      return {
        reason: "aspect-ratio",
        label: "Aspect ratio",
        transform: (d) => commands.setAspectRatio(d, intent.ratio),
      };
    case "set-adjustments":
      return {
        reason: "adjustments",
        label: "Adjust",
        transform: (d) => commands.setAdjustments(d, intent.adjustments),
      };
    case "set-output":
      return {
        reason: "output",
        label: "Output settings",
        transform: (d) => commands.setOutput(d, intent.output),
      };
    case "set-frame":
      return { reason: "frame", label: "Frame", transform: (d) => commands.setFrame(d, intent.frame) };
    case "resize":
      return {
        reason: "resize",
        label: "Resize",
        transform: (d) => {
          const target = resolveSize(effectiveCrop(d), intent.resize);
          return commands.setOutput(d, { width: target.width, height: target.height });
        },
      };
    case "add-layer":
      return {
        reason: "layer-add",
        label: "Add annotation",
        transform: (d) => commands.addLayer(d, intent.layer, intent.index),
      };
    case "update-layer":
      return {
        reason: "layer-update",
        label: "Edit annotation",
        transform: (d) => commands.updateLayer(d, intent.id, intent.patch),
      };
    case "move-layer":
      return {
        reason: "layer-move",
        label: "Move annotation",
        transform: (d) => commands.moveLayerBy(d, intent.id, intent.delta),
      };
    case "drag-layer-handle":
      return {
        reason: "layer-transform",
        label: intent.handle === "rotate" ? "Rotate annotation" : "Resize annotation",
        transform: (d) =>
          commands.dragLayerHandle(d, intent.id, intent.handle, intent.pointer, {
            ...(intent.minSize === undefined ? {} : { minSize: intent.minSize }),
            ...(intent.aspectRatio === undefined ? {} : { aspectRatio: intent.aspectRatio }),
            ...(intent.snap === undefined ? {} : { snap: intent.snap }),
          }),
      };
    case "reorder-layer":
      return {
        reason: "layer-reorder",
        label: "Reorder annotation",
        transform: (d) => commands.reorderLayer(d, intent.id, intent.index),
      };
    case "remove-layer":
      return {
        reason: "layer-remove",
        label: "Delete annotation",
        transform: (d) => commands.removeLayer(d, intent.id),
      };
    case "reset":
      return { reason: "reset", label: "Reset", transform: commands.resetEdits };
    case "set-document":
      return {
        reason: "set-document",
        label: "Replace document",
        transform: () => cloneDocument(intent.document),
      };
    case "transform":
      return {
        reason: intent.reason,
        label: intent.label ?? intent.reason,
        transform: intent.transform,
        ...(intent.silent === undefined ? {} : { silent: intent.silent }),
      };
    default:
      return null;
  }
}

/** Selection only survives while the layer it points at does. */
