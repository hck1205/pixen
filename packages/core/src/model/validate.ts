import { PixenError } from "../errors/index.js";
import type { Point, Rect } from "../geometry/types.js";
import { DEFAULT_STROKE } from "./layers.js";
import type { EditorDocument, EditorLayer } from "./types.js";

function fail(path: string, expected: string): never {
  throw new PixenError("INVALID_DOCUMENT", `Invalid document at "${path}": expected ${expected}`, {
    details: { path, expected },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "a finite number");
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "a boolean");
  return value;
}

function str(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "a string");
  return value;
}

function point(value: unknown, path: string): Point {
  if (!isRecord(value)) fail(path, "a point");
  return { x: num(value.x, `${path}.x`), y: num(value.y, `${path}.y`) };
}

function rect(value: unknown, path: string): Rect {
  if (!isRecord(value)) fail(path, "a rect");
  const width = num(value.width, `${path}.width`);
  const height = num(value.height, `${path}.height`);
  if (width < 0 || height < 0) fail(path, "a rect with non-negative size");
  return { x: num(value.x, `${path}.x`), y: num(value.y, `${path}.y`), width, height };
}

function layer(value: unknown, path: string): EditorLayer {
  if (!isRecord(value)) fail(path, "a layer object");
  const base = {
    id: str(value.id, `${path}.id`),
    visible: bool(value.visible ?? true, `${path}.visible`),
    locked: bool(value.locked ?? false, `${path}.locked`),
    opacity: num(value.opacity ?? 1, `${path}.opacity`),
    rotation: num(value.rotation ?? 0, `${path}.rotation`),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
  };

  switch (value.type) {
    case "rect":
      return {
        ...base,
        type: "rect",
        frame: rect(value.frame, `${path}.frame`),
        stroke: (value.stroke ?? null) as EditorLayer extends { stroke: infer S } ? S : never,
        fill: (value.fill ?? null) as string | null,
        cornerRadius: num(value.cornerRadius ?? 0, `${path}.cornerRadius`),
      } as EditorLayer;
    case "ellipse":
      return {
        ...base,
        type: "ellipse",
        frame: rect(value.frame, `${path}.frame`),
        stroke: (value.stroke ?? null) as never,
        fill: (value.fill ?? null) as string | null,
      } as EditorLayer;
    case "line":
      return {
        ...base,
        type: "line",
        from: point(value.from, `${path}.from`),
        to: point(value.to, `${path}.to`),
        stroke: (value.stroke ?? { ...DEFAULT_STROKE }) as never,
        arrowStart: bool(value.arrowStart ?? false, `${path}.arrowStart`),
        arrowEnd: bool(value.arrowEnd ?? false, `${path}.arrowEnd`),
      } as EditorLayer;
    case "path": {
      if (!Array.isArray(value.points)) fail(`${path}.points`, "an array of points");
      return {
        ...base,
        type: "path",
        points: value.points.map((p, i) => point(p, `${path}.points[${i}]`)),
        stroke: (value.stroke ?? { ...DEFAULT_STROKE }) as never,
        closed: bool(value.closed ?? false, `${path}.closed`),
      } as EditorLayer;
    }
    case "text":
      return {
        ...base,
        type: "text",
        position: point(value.position, `${path}.position`),
        text: str(value.text, `${path}.text`),
        fontSize: num(value.fontSize ?? 48, `${path}.fontSize`),
        fontFamily: str(value.fontFamily ?? "system-ui, sans-serif", `${path}.fontFamily`),
        color: str(value.color ?? "#ffffff", `${path}.color`),
        align: (value.align ?? "left") as "left" | "center" | "right",
        backgroundColor: (value.backgroundColor ?? null) as string | null,
        maxWidth: value.maxWidth == null ? null : num(value.maxWidth, `${path}.maxWidth`),
      } as EditorLayer;
    default:
      fail(`${path}.type`, "a known layer type");
  }
}

/**
 * Structural validation for documents crossing a trust boundary (host storage,
 * a server, a pasted string). It normalises optional fields rather than
 * rejecting documents that merely omit them.
 */
export function parseDocument(value: unknown): EditorDocument {
  if (!isRecord(value)) fail("$", "an object");
  const source = value.source;
  if (!isRecord(source)) fail("$.source", "a source descriptor");

  const transform = isRecord(value.transform) ? value.transform : {};
  const adjustments = isRecord(value.adjustments) ? value.adjustments : {};
  const output = isRecord(value.output) ? value.output : {};
  const layers = Array.isArray(value.layers) ? value.layers : [];

  return {
    schemaVersion: num(value.schemaVersion, "$.schemaVersion"),
    source: {
      resourceId: str(source.resourceId, "$.source.resourceId"),
      width: num(source.width, "$.source.width"),
      height: num(source.height, "$.source.height"),
      ...(typeof source.name === "string" ? { name: source.name } : {}),
      ...(typeof source.mimeType === "string" ? { mimeType: source.mimeType } : {}),
    },
    transform: {
      rotation: num(transform.rotation ?? 0, "$.transform.rotation"),
      flipX: bool(transform.flipX ?? false, "$.transform.flipX"),
      flipY: bool(transform.flipY ?? false, "$.transform.flipY"),
    },
    crop: value.crop == null ? null : rect(value.crop, "$.crop"),
    aspectRatio: value.aspectRatio == null ? null : num(value.aspectRatio, "$.aspectRatio"),
    adjustments: {
      brightness: num(adjustments.brightness ?? 0, "$.adjustments.brightness"),
      contrast: num(adjustments.contrast ?? 0, "$.adjustments.contrast"),
      saturation: num(adjustments.saturation ?? 0, "$.adjustments.saturation"),
    },
    layers: layers.map((l, i) => layer(l, `$.layers[${i}]`)),
    output: {
      width: output.width == null ? null : num(output.width, "$.output.width"),
      height: output.height == null ? null : num(output.height, "$.output.height"),
      format: (output.format ?? null) as EditorDocument["output"]["format"],
      quality: num(output.quality ?? 0.85, "$.output.quality"),
      background: (output.background ?? null) as string | null,
    },
    meta: isRecord(value.meta) ? (value.meta as Record<string, unknown>) : {},
  };
}
