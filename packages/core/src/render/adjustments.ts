import type { Adjustments } from "../model/types.js";

/**
 * The CSS filter chain, done a pixel at a time.
 *
 * This is what a browser without `ctx.filter` gets, and it has to reach the same
 * picture: an export must not differ from the preview because of the engine it
 * ran in. The order here is the order `cssFilter` emits, because filters do not
 * commute — sepia after saturate is not saturate after sepia — so the two stay
 * deliberately in step.
 *
 * Every matrix is written out from the W3C **Filter Effects Module Level 1**
 * definitions rather than copied from anywhere; see `docs/PROVENANCE.md`.
 */

/** Largest value a colour channel can hold. */
const CHANNEL_MAX = 255;

/**
 * How far a full white-balance swing moves a channel.
 *
 * A third: enough to correct an indoor cast, not enough to turn a photograph
 * into a colour wash at the end of the slider. Chosen by eye against this
 * project's own sample, like the presets next door.
 */
const WHITE_BALANCE_GAIN = 0.3;

/**
 * Luminance coefficients from the `saturate()` colour matrix in the W3C Filter
 * Effects specification, so the fallback matches the browser's own filter.
 */
const LUMA_R = 0.213;
const LUMA_G = 0.715;
const LUMA_B = 0.072;

/** The `sepia()` colour matrix from the same specification. */
const SEPIA_MATRIX = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
] as const;

export function applyAdjustmentsToImageData(data: Uint8ClampedArray, adjustments: Adjustments): void {
  const brightness = (1 + adjustments.brightness) * 2 ** adjustments.exposure;
  const contrast = 1 + adjustments.contrast;
  const saturation = 1 + adjustments.saturation;
  const { hue, grayscale, sepia, invert, gamma, temperature, tint } = adjustments;
  if (
    brightness === 1 &&
    contrast === 1 &&
    saturation === 1 &&
    hue === 0 &&
    grayscale === 0 &&
    sepia === 0 &&
    invert === 0 &&
    gamma === 0 &&
    temperature === 0 &&
    tint === 0
  ) {
    return;
  }

  const contrastOffset = 127.5 * (1 - contrast);
  const hueMatrix = hue === 0 ? null : hueRotationMatrix((hue * Math.PI) / 180);
  // Stored as an exponent so its neutral is zero; the curve wants the number.
  const gammaExponent = gamma === 0 ? 1 : 1 / 2 ** gamma;
  // White balance as channel gains. Amber lifts red and drops blue; magenta
  // drops green and lifts the other two by half as much, which is the axis a
  // green cast runs along.
  const redGain = 1 + temperature * WHITE_BALANCE_GAIN + tint * WHITE_BALANCE_GAIN * 0.5;
  const greenGain = 1 - tint * WHITE_BALANCE_GAIN;
  const blueGain = 1 - temperature * WHITE_BALANCE_GAIN + tint * WHITE_BALANCE_GAIN * 0.5;

  for (let i = 0; i < data.length; i += 4) {
    let r = (data[i] ?? 0) * brightness;
    let g = (data[i + 1] ?? 0) * brightness;
    let b = (data[i + 2] ?? 0) * brightness;

    r = r * contrast + contrastOffset;
    g = g * contrast + contrastOffset;
    b = b * contrast + contrastOffset;

    if (saturation !== 1) {
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
    }

    if (hueMatrix) {
      const [next_r, next_g, next_b] = applyMatrix(hueMatrix, r, g, b);
      r = next_r;
      g = next_g;
      b = next_b;
    }

    if (grayscale !== 0) {
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      r += (luma - r) * grayscale;
      g += (luma - g) * grayscale;
      b += (luma - b) * grayscale;
    }

    if (sepia !== 0) {
      const [toned_r, toned_g, toned_b] = applyMatrix(SEPIA_MATRIX, r, g, b);
      r += (toned_r - r) * sepia;
      g += (toned_g - g) * sepia;
      b += (toned_b - b) * sepia;
    }

    if (invert !== 0) {
      r += (CHANNEL_MAX - r - r) * invert;
      g += (CHANNEL_MAX - g - g) * invert;
      b += (CHANNEL_MAX - b - b) * invert;
    }

    // Last, and last in the filter path too: when the browser has `ctx.filter`
    // these run as a second pass over what it produced, so applying them here
    // in any other order would make the two engines disagree.
    if (gamma !== 0) {
      r = CHANNEL_MAX * (clamp255(r) / CHANNEL_MAX) ** gammaExponent;
      g = CHANNEL_MAX * (clamp255(g) / CHANNEL_MAX) ** gammaExponent;
      b = CHANNEL_MAX * (clamp255(b) / CHANNEL_MAX) ** gammaExponent;
    }

    if (temperature !== 0 || tint !== 0) {
      r *= redGain;
      g *= greenGain;
      b *= blueGain;
    }

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
}

type ColourMatrix = readonly (readonly [number, number, number])[];

function applyMatrix(matrix: ColourMatrix, r: number, g: number, b: number): [number, number, number] {
  return [
    matrix[0]![0] * r + matrix[0]![1] * g + matrix[0]![2] * b,
    matrix[1]![0] * r + matrix[1]![1] * g + matrix[1]![2] * b,
    matrix[2]![0] * r + matrix[2]![1] * g + matrix[2]![2] * b,
  ];
}

/**
 * The `hue-rotate()` matrix from the W3C Filter Effects specification: the
 * luminance-preserving rotation, written out from the constants it gives.
 */
function hueRotationMatrix(radians: number): ColourMatrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    [
      LUMA_R + cos * (1 - LUMA_R) - sin * LUMA_R,
      LUMA_G - cos * LUMA_G - sin * LUMA_G,
      LUMA_B - cos * LUMA_B + sin * (1 - LUMA_B),
    ],
    [
      LUMA_R - cos * LUMA_R + sin * 0.143,
      LUMA_G + cos * (1 - LUMA_G) + sin * 0.14,
      LUMA_B - cos * LUMA_B - sin * 0.283,
    ],
    [
      LUMA_R - cos * LUMA_R - sin * (1 - LUMA_R),
      LUMA_G - cos * LUMA_G + sin * LUMA_G,
      LUMA_B + cos * (1 - LUMA_B) + sin * LUMA_B,
    ],
  ];
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > CHANNEL_MAX ? CHANNEL_MAX : value;
}

/**
 * The three a canvas filter cannot express.
 *
 * Not an oversight in the CSS specification and not a gap in the browsers: a
 * filter chain is a fixed set of functions, and a gamma curve and a channel
 * gain are not among them. So these cost a pass over every pixel whatever
 * engine is drawing — which is exactly why they are named rather than mixed in.
 */
export const PIXEL_ONLY_ADJUSTMENTS = ["gamma", "temperature", "tint"] as const;

export interface AdjustmentPlan {
  /** The CSS filter chain, or "" when the engine is not using one. */
  filter: string;
  /** The adjustments to run per pixel afterwards, or null when there are none. */
  pixels: Adjustments | null;
}

/**
 * What each engine has to do to reach the same picture.
 *
 * With a filter the browser does most of the work and the three above run as a
 * second pass; without one everything runs per pixel. Both paths must produce
 * the same file — an export that differs from the preview because of the engine
 * it ran in is the bug this whole arrangement exists to prevent — so the
 * decision is made once, here, rather than in the two builders.
 */
export function adjustmentPlan(
  adjustments: Adjustments,
  filter: string,
  canUseFilter: boolean,
): AdjustmentPlan {
  const pixelOnly = PIXEL_ONLY_ADJUSTMENTS.some((key) => adjustments[key] !== 0);

  if (!canUseFilter) {
    // One pass over everything, or nothing at all if there is nothing to do.
    return { filter: "", pixels: filter !== "" || pixelOnly ? adjustments : null };
  }

  if (!pixelOnly) return { filter, pixels: null };

  // The filter did the ones it can express, so the pass must not do them again.
  const pixels = { ...adjustments };
  for (const key of Object.keys(pixels) as Array<keyof Adjustments>) {
    if (!PIXEL_ONLY_ADJUSTMENTS.includes(key as (typeof PIXEL_ONLY_ADJUSTMENTS)[number])) pixels[key] = 0;
  }
  return { filter, pixels };
}
