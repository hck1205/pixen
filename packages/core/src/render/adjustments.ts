import type { Adjustments } from "../model/types.js";
import type { Canvas2D } from "../image/canvas.js";

/**
 * Canvas2D `filter` is unavailable on older Safari, so it is feature-detected —
 * per context, cached in a WeakMap rather than a module-level flag, so a test or
 * a second canvas can never inherit another one's answer.
 */
const filterSupport = new WeakMap<object, boolean>();

export function supportsContextFilter(context: Canvas2D): boolean {
  const cached = filterSupport.get(context);
  if (cached !== undefined) return cached;

  let supported = false;
  try {
    const previous = context.filter;
    context.filter = "brightness(1.5)";
    supported = context.filter !== "none" && context.filter !== "";
    context.filter = previous ?? "none";
  } catch {
    supported = false;
  }
  filterSupport.set(context, supported);
  return supported;
}

/**
 * Pixel fallback for the CSS filter chain, for browsers without `ctx.filter`.
 *
 * The order here is the order `cssFilter` emits, because filters do not
 * commute: sepia after saturate is not saturate after sepia. An export must not
 * look different from the preview just because the browser lacks canvas
 * filters, so the two stay deliberately in step.
 */
/** Largest value a colour channel can hold. */
const CHANNEL_MAX = 255;

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
  const { hue, grayscale, sepia, invert } = adjustments;
  if (
    brightness === 1 &&
    contrast === 1 &&
    saturation === 1 &&
    hue === 0 &&
    grayscale === 0 &&
    sepia === 0 &&
    invert === 0
  ) {
    return;
  }

  const contrastOffset = 127.5 * (1 - contrast);
  const hueMatrix = hue === 0 ? null : hueRotationMatrix((hue * Math.PI) / 180);

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
