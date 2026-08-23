import { describe, expect, it } from "vitest";
import { LINE_ENDS, lineEndInset, lineEndOps, type LineEnd, type Stroke } from "@pixen/core";

/**
 * What sits at the end of a line.
 *
 * Eight of them, and the reason they are eight rather than a boolean is that a
 * line means different things at each end: an arrow points, a bar measures, a
 * circle marks a spot, a square marks a corner. The open and solid pairs are
 * the same shape drawn stroked or filled, which is a real distinction over a
 * busy photograph.
 */
const stroke: Stroke = { color: "#ff0000", width: 4 };
const tip = { x: 100, y: 50 };

const opsFor = (style: LineEnd) => lineEndOps(style, tip, 0, stroke);

describe("every decoration", () => {
  it("draws nothing for none, and something for the other seven", () => {
    expect(opsFor("none")).toEqual([]);
    for (const style of LINE_ENDS.filter((name) => name !== "none")) {
      expect(opsFor(style).length, style).toBeGreaterThan(0);
    }
  });

  it("is stroked when open and filled when solid", () => {
    for (const style of ["arrow", "circle", "square"] as const) {
      const open = opsFor(style)[0] as { stroke?: unknown; fill?: unknown };
      const solid = opsFor(`${style}-solid` as LineEnd)[0] as { stroke?: unknown; fill?: unknown };
      expect(open.stroke, style).toBeDefined();
      expect(open.fill, style).toBeUndefined();
      expect(solid.fill, style).toBe(stroke.color);
      expect(solid.stroke, style).toBeUndefined();
    }
  });

  it("takes its colour and thickness from the line it belongs to", () => {
    const outline = (opsFor("bar")[0] as { stroke: { color: string; width: number } }).stroke;
    expect(outline).toMatchObject({ color: stroke.color, width: stroke.width });
  });

  it("scales with the stroke rather than sitting at a fixed size", () => {
    // The reason every annotation measurement is a multiple of something: a
    // head six pixels wide on a thumbnail and on a 6000px export is a
    // different drawing at each size.
    const thin = lineEndInset("arrow-solid", 2);
    const thick = lineEndInset("arrow-solid", 8);
    expect(thick).toBeCloseTo(thin * 4);
  });
});

describe("where the shaft stops", () => {
  it("pulls back for anything the shaft would show through", () => {
    for (const style of ["arrow", "arrow-solid", "circle", "circle-solid", "square", "square-solid"] as const) {
      expect(lineEndInset(style, stroke.width), style).toBeGreaterThan(0);
    }
  });

  it("does not pull back for a bar or for nothing", () => {
    // A bar is drawn across the tip, so the shaft running into it is the point.
    expect(lineEndInset("bar", stroke.width)).toBe(0);
    expect(lineEndInset("none", stroke.width)).toBe(0);
  });
});

describe("where each decoration sits", () => {
  /** Every point the ops mention, which is all a placement test needs. */
  const points = (style: LineEnd) =>
    opsFor(style).flatMap((op) =>
      op.op === "path"
        ? op.commands.flatMap((command) =>
            "to" in command ? [command.to] : "centre" in command ? [command.centre] : [],
          )
        : [],
    );

  it("puts an arrow's point on the tip and its barbs behind it", () => {
    const drawn = points("arrow");
    expect(drawn).toContainEqual(tip);
    // Behind, along the shaft: every other point is to the left of the tip.
    for (const point of drawn.filter((candidate) => candidate.x !== tip.x)) {
      expect(point.x).toBeLessThan(tip.x);
    }
  });

  it("centres a circle and a square on the tip", () => {
    expect(points("circle-solid")).toContainEqual(tip);
    const square = points("square");
    const middleX = square.reduce((total, point) => total + point.x, 0) / square.length;
    expect(middleX).toBeCloseTo(tip.x);
  });

  it("draws a bar across the shaft rather than along it", () => {
    const [first, second] = points("bar");
    expect(first!.x).toBeCloseTo(tip.x);
    expect(second!.x).toBeCloseTo(tip.x);
    expect(first!.y).not.toBeCloseTo(second!.y);
  });

  it("turns with the line, so both ends are drawn by the same function", () => {
    const [forward] = lineEndOps("bar", tip, 0, stroke);
    const [turned] = lineEndOps("bar", tip, Math.PI / 2, stroke);
    expect(forward).not.toEqual(turned);
  });
});
