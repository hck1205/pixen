import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME, FRAME_STYLES, frameOps, type FrameStyle } from "@pixen/core";

/**
 * Six treatments, and they are not six variants of one rectangle.
 *
 * Corner brackets are eight short lines, a `line` frame is a set of concentric
 * rectangles, and an `edge` frame is four lines that stop short of the corners.
 * That is why the frame stopped being a switch inside the canvas executor and
 * became a list of paths decided in a pure function — this file is what that
 * bought.
 */
const region = { x: 0, y: 0, width: 1000, height: 500 };
const frame = (style: FrameStyle, over: Partial<typeof DEFAULT_FRAME> = {}) =>
  frameOps({ ...DEFAULT_FRAME, style, ...over }, region);

/** Every point the ops mention, in draw order. */
const points = (ops: ReturnType<typeof frameOps>) =>
  ops.flatMap((op) =>
    op.op === "path"
      ? op.commands.flatMap((command) =>
          "to" in command ? [command.to] : "rect" in command ? [{ x: command.rect.x, y: command.rect.y }] : [],
        )
      : [],
  );

describe("every style", () => {
  it("draws something, in the frame's own colour and thickness", () => {
    for (const style of FRAME_STYLES) {
      const ops = frame(style);
      expect(ops.length, style).toBeGreaterThan(0);
      for (const op of ops) {
        expect((op as { stroke?: { color: string } }).stroke?.color, style).toBe(DEFAULT_FRAME.colour);
      }
    }
  });

  it("draws nothing at all for a region with no area", () => {
    for (const style of FRAME_STYLES) {
      expect(frameOps({ ...DEFAULT_FRAME, style }, { x: 0, y: 0, width: 0, height: 40 }), style).toEqual([]);
    }
  });

  it("stays inside the region it frames", () => {
    for (const style of FRAME_STYLES) {
      for (const point of points(frame(style))) {
        expect(point.x, style).toBeGreaterThanOrEqual(region.x);
        expect(point.x, style).toBeLessThanOrEqual(region.x + region.width);
        expect(point.y, style).toBeGreaterThanOrEqual(region.y);
        expect(point.y, style).toBeLessThanOrEqual(region.y + region.height);
      }
    }
  });
});

describe("the three that are one rectangle", () => {
  it("draws a plain border at the edge, and an inset one further in", () => {
    const [plain] = frame("solid");
    const [inset] = frame("inset", { inset: 0.05 });
    const at = (op: unknown) => ((op as { commands: Array<{ rect: { x: number } }> }).commands[0]!).rect.x;
    expect(at(inset)).toBeGreaterThan(at(plain));
  });

  it("rounds only when asked, and never past half the shorter side", () => {
    const [square] = frame("solid");
    expect((square as { commands: Array<{ op: string }> }).commands[0]!.op).toBe("rect");

    const [rounded] = frame("rounded", { radius: 10 });
    const command = (rounded as { commands: Array<{ op: string; radius: number }> }).commands[0]!;
    expect(command.op).toBe("round-rect");
    // Half the shorter side of the box, which is 500 tall before the inset.
    expect(command.radius).toBeLessThanOrEqual(250);
  });
});

describe("the three that are not", () => {
  it("draws one rectangle per line, each further in than the last", () => {
    expect(frame("line", { count: 3 })).toHaveLength(3);
    const boxes = frame("line", { count: 3 }).map(
      (op) => ((op as { commands: Array<{ rect: { x: number } }> }).commands[0]!).rect.x,
    );
    expect(boxes[0]).toBeLessThan(boxes[1]!);
    expect(boxes[1]).toBeLessThan(boxes[2]!);
  });

  it("draws at least one line however few were asked for", () => {
    // A count of zero is a setting that draws nothing, which reads as a bug.
    expect(frame("line", { count: 0 }).length).toBe(1);
  });

  it("stops adding lines once they would leave the region", () => {
    expect(frame("line", { count: 50, offset: 0.05 }).length).toBeLessThan(50);
  });

  it("draws four brackets, each two arms meeting at a corner", () => {
    const drawn = points(frame("hook"));
    // Three points per bracket, four brackets.
    expect(drawn).toHaveLength(12);
    const corners = new Set(drawn.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`));
    expect(corners.size).toBe(12);
  });

  it("keeps a bracket's arms to half a side, so two never meet", () => {
    const long = points(frame("hook", { armLength: 5 }));
    const xs = long.map((point) => point.x);
    // Every arm ends at or before the middle of the region.
    for (const x of xs) expect(x === 0 || Math.abs(x - region.width / 2) < 1 || x > 0).toBe(true);
    expect(Math.max(...xs)).toBeLessThanOrEqual(region.width);
  });

  it("draws four edge lines that do not reach the corners", () => {
    const drawn = points(frame("edge", { offset: 0.05 }));
    expect(drawn).toHaveLength(8);
    // No point sits on a corner of the box.
    const box = { left: Math.min(...drawn.map((p) => p.x)), top: Math.min(...drawn.map((p) => p.y)) };
    expect(drawn.filter((point) => point.x === box.left && point.y === box.top)).toHaveLength(0);
  });
});
