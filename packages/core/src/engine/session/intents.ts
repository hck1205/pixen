import type { CropHandle } from "../../geometry/crop.js";
import type { Point, Rect } from "../../geometry/types.js";
import type { ResizeIntent } from "../../image/resize.js";
import { resolveSize } from "../../image/resize.js";
import type { TextMeasurer } from "../../model/text-layout.js";
import type { StepName } from "./steps.js";
import type { ClipBounds, ClipRange } from "../../model/clip.js";
import { cloneDocument, effectiveCrop } from "../../model/document.js";
import type { LayerHandle } from "../../model/transform.js";
import type {
  Adjustments,
  EditorDocument,
  EditorLayer,
  FrameSettings,
  OutputSettings,
} from "../../model/types.js";
import * as commands from "../commands/index.js";
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
  | {
      kind: "set-clip";
      range: ClipRange | null;
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

/**
 * A document-only change: which command runs, and how it appears in history.
 *
 * A step the engine performs names itself and is worded by whoever is showing
 * it; a `transform` intent carries a host's own label, which is used as given.
 * Exactly one of the two, so a step cannot be both named and worded.
 */
export type DocumentChange = {
  reason: string;
  transform: (document: EditorDocument) => EditorDocument;
  /** Mid-gesture steps are not their own undo entries. */
  silent?: boolean;
} & ({ step: StepName; label?: undefined } | { step?: undefined; label: string });

/**
 * The intent-to-command table. Keeping it a pure lookup means "what does
 * rotate-right do" has one answer, checkable without constructing an editor.
 */
export function documentChangeFor(intent: Intent, measure?: TextMeasurer): DocumentChange | null {
  switch (intent.kind) {
    case "rotate-by":
      return { reason: "rotate", step: "rotate", transform: (d) => commands.rotateBy(d, intent.radians) };
    case "rotate-quarter-turns":
      return {
        reason: "rotate",
        step: "rotate",
        transform: (d) => commands.rotateQuarterTurns(d, intent.turns),
      };
    case "straighten":
      return {
        reason: "straighten",
        step: "straighten",
        transform: (d) => commands.straighten(d, intent.radians),
      };
    case "flip":
      return {
        reason: "flip",
        step: intent.axis === "x" ? "flipHorizontal" : "flipVertical",
        transform: (d) => commands.flip(d, intent.axis),
      };
    case "set-crop":
      return {
        reason: "crop",
        step: intent.rect ? "crop" : "resetCrop",
        transform: (d) => commands.setCrop(d, intent.rect),
      };
    case "drag-crop-handle":
      return {
        reason: "crop-drag",
        step: "crop",
        transform: (d) => commands.dragCropHandle(d, intent.handle, intent.pointer, intent.minSize),
      };
    case "pan-crop":
      return { reason: "crop-pan", step: "moveCrop", transform: (d) => commands.panCrop(d, intent.delta) };
    case "set-clip":
      return {
        reason: "clip",
        step: intent.range ? "trim" : "resetTrim",
        transform: (d) => commands.setClip(d, intent.range, intent.bounds),
      };
    case "set-aspect-ratio":
      return {
        reason: "aspect-ratio",
        step: "aspectRatio",
        transform: (d) => commands.setAspectRatio(d, intent.ratio),
      };
    case "set-adjustments":
      return {
        reason: "adjustments",
        step: "adjust",
        transform: (d) => commands.setAdjustments(d, intent.adjustments),
      };
    case "set-output":
      return {
        reason: "output",
        step: "output",
        transform: (d) => commands.setOutput(d, intent.output),
      };
    case "set-frame":
      return { reason: "frame", step: "frame", transform: (d) => commands.setFrame(d, intent.frame) };
    case "resize":
      return {
        reason: "resize",
        step: "resize",
        transform: (d) => {
          const target = resolveSize(effectiveCrop(d), intent.resize);
          return commands.setOutput(d, { width: target.width, height: target.height });
        },
      };
    case "add-layer":
      return {
        reason: "layer-add",
        step: "addLayer",
        transform: (d) => commands.addLayer(d, intent.layer, intent.index),
      };
    case "update-layer":
      return {
        reason: "layer-update",
        step: "editLayer",
        transform: (d) => commands.updateLayer(d, intent.id, intent.patch),
      };
    case "move-layer":
      return {
        reason: "layer-move",
        step: "moveLayer",
        transform: (d) => commands.moveLayerBy(d, intent.id, intent.delta),
      };
    case "drag-layer-handle":
      return {
        reason: "layer-transform",
        step: intent.handle === "rotate" ? "rotateLayer" : "moveLayerHandle",
        transform: (d) =>
          commands.dragLayerHandle(d, intent.id, intent.handle, intent.pointer, {
            minSize: intent.minSize,
            aspectRatio: intent.aspectRatio,
            snap: intent.snap,
            measure,
          }),
      };
    case "reorder-layer":
      return {
        reason: "layer-reorder",
        step: "reorderLayer",
        transform: (d) => commands.reorderLayer(d, intent.id, intent.index),
      };
    case "remove-layer":
      return {
        reason: "layer-remove",
        step: "deleteLayer",
        transform: (d) => commands.removeLayer(d, intent.id),
      };
    case "reset":
      return { reason: "reset", step: "reset", transform: commands.resetEdits };
    case "set-document":
      return {
        reason: "set-document",
        step: "replaceDocument",
        transform: () => cloneDocument(intent.document),
      };
    case "transform":
      return {
        reason: intent.reason,
        // A named step, a label, or — for a host that gave neither — the reason,
        // which is at least a word about what happened.
        ...(intent.step ? { step: intent.step } : { label: intent.label ?? intent.reason }),
        transform: intent.transform,
        ...(intent.silent === undefined ? {} : { silent: intent.silent }),
      };

    // Not changes to the document. The session machine handles selection,
    // transactions and history itself, and they are listed rather than left to
    // a catch-all so the check below can do its job.
    case "select":
    case "begin-transaction":
    case "commit-transaction":
    case "rollback-transaction":
    case "undo":
    case "redo":
      return null;

    default: {
      // Adding a document-changing intent without a case here fails to compile.
      // Without this the union and the table drift apart silently, and the
      // first anyone hears of it is an "unknown intent" at runtime.
      const unhandled: never = intent;
      void unhandled;
      return null;
    }
  }
}
