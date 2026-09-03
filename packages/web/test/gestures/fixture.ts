/**
 * Shared by every gesture test: one context, and two ways to read an outcome.
 *
 * Not a test file — vitest picks up `*.test.ts` — but it lives here so the
 * folder mirrors `src/viewport/gestures/` file for file.
 */
import { IDENTITY, type Intent, estimateTextWidth } from "@pixen/core";
import { type GestureContext, type GestureEffect } from "../../src/viewport/gestures/index.js";
import { DEFAULT_STYLE } from "../../src/tools/index.js";

/**
 * Identity matrices make screen, stage and image coordinates the same, so these
 * tests read as statements about behaviour rather than about arithmetic. The
 * conversion itself is exercised separately with a scaled view.
 */
export function context(overrides: Partial<GestureContext> = {}): GestureContext {
  let counter = 0;
  return {
    tool: "crop",
    crop: { x: 100, y: 100, width: 400, height: 200 },
    layers: [],
    viewMatrix: IDENTITY,
    stageFromImage: IDENTITY,
    imageLongestEdge: 1000,
    measure: estimateTextWidth,
    style: DEFAULT_STYLE,
    minCropSize: 24,
    createId: (prefix) => `${prefix}_${++counter}`,
    ...overrides,
  };
}

export function intents(effects: readonly GestureEffect[]): Intent[] {
  return effects.flatMap((effect) => (effect.kind === "intent" ? [effect.intent] : []));
}

export function kinds(effects: readonly GestureEffect[]): string[] {
  return effects.map((effect) => (effect.kind === "intent" ? `intent:${effect.intent.kind}` : effect.kind));
}

export const at = (x: number, y: number) => ({ point: { x, y } });
