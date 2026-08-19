import type { Size } from "../geometry/types.js";
import type { Editor } from "../engine/editor.js";
import type { ImageFormat } from "../model/types.js";
import type { ProcessOptions } from "./process.js";

/**
 * A named set of output rules.
 *
 * Most teams do not want "an image editor" so much as a guarantee that every
 * uploaded image satisfies the same constraints. A policy makes that a value the
 * host can store, share between the client and its backend, and enforce.
 */
export interface ImagePolicy {
  name?: string;
  aspectRatio?: number | null;
  minWidth?: number;
  minHeight?: number;
  outputWidth?: number | null;
  outputHeight?: number | null;
  maxWidth?: number | null;
  maxHeight?: number | null;
  format?: ImageFormat;
  quality?: number;
  maxFileSize?: number;
  background?: string | null;
}

export interface PolicyViolation {
  rule: "minWidth" | "minHeight" | "aspectRatio" | "maxFileSize";
  message: string;
  expected: number;
  actual: number;
}

export const PRESETS = {
  /** Square avatar, small enough to serve directly. */
  profile: {
    name: "profile",
    aspectRatio: 1,
    minWidth: 320,
    minHeight: 320,
    outputWidth: 1024,
    outputHeight: 1024,
    format: "image/webp",
    quality: 0.85,
    maxFileSize: 500_000,
  },
  /** Product photography for a listing grid. */
  marketplace: {
    name: "marketplace",
    aspectRatio: 4 / 3,
    minWidth: 800,
    maxWidth: 1600,
    format: "image/webp",
    quality: 0.82,
    maxFileSize: 1_000_000,
  },
  /** Wide hero image. */
  banner: {
    name: "banner",
    aspectRatio: 16 / 9,
    minWidth: 1280,
    maxWidth: 2400,
    format: "image/jpeg",
    quality: 0.82,
    background: "#ffffff",
  },
} satisfies Record<string, ImagePolicy>;

export type PresetName = keyof typeof PRESETS;

function resolvePolicy(policy: ImagePolicy | PresetName): ImagePolicy {
  return typeof policy === "string" ? PRESETS[policy] : policy;
}

/** Applies the policy's constraints to an editor, leaving the user free to move the crop. */
export function applyPolicy(editor: Editor, policy: ImagePolicy | PresetName): void {
  const resolved = resolvePolicy(policy);
  if (resolved.aspectRatio !== undefined) editor.setAspectRatio(resolved.aspectRatio);

  const output: Parameters<Editor["setOutput"]>[0] = {};
  if (resolved.outputWidth !== undefined) output.width = resolved.outputWidth;
  if (resolved.outputHeight !== undefined) output.height = resolved.outputHeight;
  if (resolved.format !== undefined) output.format = resolved.format;
  if (resolved.quality !== undefined) output.quality = resolved.quality;
  if (resolved.background !== undefined) output.background = resolved.background;
  if (Object.keys(output).length > 0) editor.setOutput(output);

  if (resolved.outputWidth == null && resolved.outputHeight == null && (resolved.maxWidth || resolved.maxHeight)) {
    editor.resize({
      maxWidth: resolved.maxWidth ?? null,
      maxHeight: resolved.maxHeight ?? null,
    });
  }
}

/** Checks a candidate result against the policy. Empty means it passes. */
export function checkPolicy(
  policy: ImagePolicy | PresetName,
  candidate: Size & { bytes?: number },
): PolicyViolation[] {
  const resolved = resolvePolicy(policy);
  const violations: PolicyViolation[] = [];

  if (resolved.minWidth != null && candidate.width < resolved.minWidth) {
    violations.push({
      rule: "minWidth",
      message: `Image must be at least ${resolved.minWidth}px wide`,
      expected: resolved.minWidth,
      actual: candidate.width,
    });
  }
  if (resolved.minHeight != null && candidate.height < resolved.minHeight) {
    violations.push({
      rule: "minHeight",
      message: `Image must be at least ${resolved.minHeight}px tall`,
      expected: resolved.minHeight,
      actual: candidate.height,
    });
  }
  if (resolved.aspectRatio != null) {
    const actual = candidate.width / candidate.height;
    if (Math.abs(actual - resolved.aspectRatio) > 0.01) {
      violations.push({
        rule: "aspectRatio",
        message: `Image must have a ${resolved.aspectRatio.toFixed(2)}:1 aspect ratio`,
        expected: resolved.aspectRatio,
        actual,
      });
    }
  }
  if (resolved.maxFileSize != null && candidate.bytes != null && candidate.bytes > resolved.maxFileSize) {
    violations.push({
      rule: "maxFileSize",
      message: `Image must be at most ${Math.round(resolved.maxFileSize / 1024)} KB`,
      expected: resolved.maxFileSize,
      actual: candidate.bytes,
    });
  }

  return violations;
}

/** Turns a policy into `processImage` options, for the headless path. */
export function policyToProcessOptions(policy: ImagePolicy | PresetName): ProcessOptions {
  const resolved = resolvePolicy(policy);
  return {
    width: resolved.outputWidth ?? null,
    height: resolved.outputHeight ?? null,
    maxWidth: resolved.maxWidth ?? null,
    maxHeight: resolved.maxHeight ?? null,
    ...(resolved.format ? { format: resolved.format } : {}),
    ...(resolved.quality != null ? { quality: resolved.quality } : {}),
    ...(resolved.maxFileSize != null ? { maxBytes: resolved.maxFileSize } : {}),
    ...(resolved.background !== undefined ? { background: resolved.background } : {}),
  };
}
