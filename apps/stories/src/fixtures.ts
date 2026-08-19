import {
  createArrowLayer,
  createEllipseLayer,
  createPathLayer,
  createRectLayer,
  createRedactLayer,
  createTextLayer,
  type Editor,
  type RedactionMode,
  type WatermarkOptions,
} from "@pixen/core";

/**
 * Every story draws its own image, so the suite has no binary fixtures, no
 * network, and no licence questions — and the same picture appears in every
 * story, which is what makes a visual change obvious.
 */
export interface SampleOptions {
  width?: number;
  height?: number;
  /** JPEG keeps stories closer to what a customer uploads; PNG keeps alpha. */
  type?: "image/jpeg" | "image/png";
}

export async function createSampleImage(options: SampleOptions = {}): Promise<Blob> {
  const width = options.width ?? 1600;
  const height = options.height ?? 1067;
  const type = options.type ?? "image/jpeg";

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#1b2a5e");
  sky.addColorStop(0.55, "#e0674f");
  sky.addColorStop(1, "#f6c177");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255, 244, 214, 0.95)";
  context.beginPath();
  context.arc(width * 0.74, height * 0.4, Math.min(width, height) * 0.07, 0, Math.PI * 2);
  context.fill();

  const ridges: Array<[number, string]> = [
    [0.67, "#2b2f4a"],
    [0.77, "#1e2137"],
    [0.87, "#141626"],
  ];
  for (const [position, colour] of ridges) {
    const baseline = height * position;
    context.fillStyle = colour;
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(0, baseline);
    for (let x = 0; x <= width; x += 40) {
      context.lineTo(x, baseline - Math.sin(x / 190) * (height * 0.066) - Math.cos(x / 70) * (height * 0.02));
    }
    context.lineTo(width, height);
    context.closePath();
    context.fill();
  }

  // A few pale marks give crop and redaction stories something to aim at.
  context.fillStyle = "rgba(255,255,255,0.85)";
  context.font = `${Math.round(height * 0.045)}px system-ui, sans-serif`;
  context.fillText("ID 4821-77", width * 0.08, height * 0.2);
  context.fillText("pixen sample", width * 0.08, height * 0.28);

  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), type, 0.9));
}

/** A transparent PNG, for checking how the editor and JPEG export treat alpha. */
export async function createTransparentSample(size = 900): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;

  context.fillStyle = "#4f8cff";
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "#ef3e36";
  context.lineWidth = size * 0.03;
  context.strokeRect(size * 0.12, size * 0.12, size * 0.76, size * 0.76);

  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
}

/** One layer of every kind, for reviewing how annotations render together. */
export function seedAnnotations(editor: Editor): void {
  const { width, height } = editor.document.source;
  const stroke = { color: "#ef3e36", width: Math.max(2, width * 0.005) };

  editor.addLayer(
    createRectLayer({ x: width * 0.06, y: height * 0.12, width: width * 0.3, height: height * 0.22 }, { stroke }),
    { select: false },
  );
  editor.addLayer(
    createEllipseLayer(
      { x: width * 0.62, y: height * 0.24, width: width * 0.2, height: height * 0.24 },
      { stroke: { ...stroke, color: "#f2a007" } },
    ),
    { select: false },
  );
  editor.addLayer(
    createArrowLayer(
      { x: width * 0.4, y: height * 0.72 },
      { x: width * 0.6, y: height * 0.44 },
      { stroke: { ...stroke, color: "#2fb673" } },
    ),
    { select: false },
  );
  editor.addLayer(
    createPathLayer(
      Array.from({ length: 24 }, (_, index) => ({
        x: width * (0.12 + index * 0.012),
        y: height * (0.62 + Math.sin(index / 3) * 0.04),
      })),
      { stroke: { ...stroke, color: "#8b5cf0" } },
    ),
    { select: false },
  );
  editor.addLayer(
    createTextLayer({ x: width * 0.06, y: height * 0.82 }, "Annotated in Pixen", {
      fontSize: Math.round(height * 0.06),
      color: "#fbfcfe",
      backgroundColor: "rgba(18,22,28,0.6)",
    }),
    { select: false },
  );
}

/** Covers the identifier printed on the sample, for redaction stories. */
export function seedRedaction(editor: Editor, mode: RedactionMode = "solid"): void {
  const { width, height } = editor.document.source;
  editor.addLayer(
    createRedactLayer({ x: width * 0.07, y: height * 0.14, width: width * 0.28, height: height * 0.075 }, { mode }),
    { select: false },
  );
}

/**
 * A mark to watermark with. Drawn here for the same reason the sample is: the
 * story suite carries no binary fixtures and no third-party artwork.
 */
export const WATERMARK_SIZE = { width: 512, height: 160 };

export async function createWatermarkMark(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WATERMARK_SIZE.width;
  canvas.height = WATERMARK_SIZE.height;
  const context = canvas.getContext("2d")!;

  context.strokeStyle = "#fbfcfe";
  context.lineWidth = 10;
  context.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  context.fillStyle = "#fbfcfe";
  context.font = "600 76px system-ui, sans-serif";
  context.textBaseline = "middle";
  context.fillText("PIXEN", 56, canvas.height / 2);

  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
}

/** Registers the mark and places it, for watermark stories. */
export async function seedWatermark(
  editor: Editor,
  options: Omit<WatermarkOptions, "resourceId" | "size"> = {},
): Promise<void> {
  const resource = await editor.resources.load(await createWatermarkMark());
  editor.addWatermark({ ...options, resourceId: resource.id, size: WATERMARK_SIZE });
}
