import { describe, expect, it } from "vitest";
import { cornerSegments, gridSegments, inflate, projectRect, CORNER_ARM } from "../src/overlay.js";

const rect = { x: 0, y: 0, width: 300, height: 150 };

describe("gridSegments", () => {
  it("draws two lines per axis for the rule of thirds", () => {
    const segments = gridSegments(rect);
    expect(segments).toHaveLength(4);
  });

  it("spaces the guides evenly across the rect", () => {
    const [firstVertical, firstHorizontal] = gridSegments(rect);
    expect(firstVertical).toEqual({ from: { x: 100, y: 0 }, to: { x: 100, y: 150 } });
    expect(firstHorizontal).toEqual({ from: { x: 0, y: 50 }, to: { x: 300, y: 50 } });
  });

  it("honours a different division count", () => {
    expect(gridSegments(rect, 2)).toHaveLength(2);
    expect(gridSegments(rect, 1)).toHaveLength(0);
  });

  it("follows an offset rect", () => {
    const offset = gridSegments({ x: 10, y: 20, width: 30, height: 30 });
    expect(offset[0]!.from).toEqual({ x: 20, y: 20 });
  });
});

describe("cornerSegments", () => {
  it("draws two arms at each of the four corners", () => {
    expect(cornerSegments(rect)).toHaveLength(8);
  });

  it("points the arms inwards from each corner", () => {
    const [horizontal, vertical] = cornerSegments(rect);
    expect(horizontal).toEqual({ from: { x: CORNER_ARM, y: 0 }, to: { x: 0, y: 0 } });
    expect(vertical).toEqual({ from: { x: 0, y: 0 }, to: { x: 0, y: CORNER_ARM } });
  });

  it("mirrors the arm direction at the far corners", () => {
    const segments = cornerSegments(rect);
    const bottomRight = segments.slice(4, 6);
    expect(bottomRight[0]!.from.x).toBeLessThan(300);
    expect(bottomRight[1]!.to.y).toBeLessThan(150);
  });

  it("caps the arm at a third of the rect so brackets never meet", () => {
    const tiny = cornerSegments({ x: 0, y: 0, width: 30, height: 30 }, 22);
    expect(tiny[0]!.from.x).toBe(10);
  });

  it("accepts a scaled arm length for high-density displays", () => {
    const scaled = cornerSegments(rect, 44);
    expect(scaled[0]!.from.x).toBe(44);
  });
});

describe("inflate", () => {
  it("grows a rect on every side", () => {
    expect(inflate({ x: 10, y: 10, width: 100, height: 50 }, 5)).toEqual({
      x: 5,
      y: 5,
      width: 110,
      height: 60,
    });
  });

  it("shrinks with a negative padding", () => {
    expect(inflate({ x: 0, y: 0, width: 10, height: 10 }, -1)).toEqual({ x: 1, y: 1, width: 8, height: 8 });
  });
});

describe("projectRect", () => {
  const toScreen = (point: { x: number; y: number }) => ({ x: point.x * 2 + 10, y: point.y * 2 + 20 });

  it("maps through the view transform and the device ratio", () => {
    expect(projectRect({ x: 0, y: 0, width: 50, height: 25 }, toScreen, 1)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });

  it("multiplies by the device pixel ratio", () => {
    expect(projectRect({ x: 0, y: 0, width: 50, height: 25 }, toScreen, 2)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });
});
