import { describe, expect, it } from "vitest";
import { delta, distance, midpoint } from "../src/geometry/point.js";

const origin = { x: 0, y: 0 };
const a = { x: 3, y: 4 };
const b = { x: 9, y: 12 };

describe("delta", () => {
  it("reads in the direction it is named: from, then to", () => {
    expect(delta(a, b)).toEqual({ x: 6, y: 8 });
  });

  it("is the negative of itself reversed", () => {
    expect(delta(b, a)).toEqual({ x: -6, y: -8 });
  });

  it("is nothing between a point and itself", () => {
    expect(delta(a, a)).toEqual(origin);
  });
});

describe("distance", () => {
  it("is the hypotenuse", () => {
    expect(distance(origin, a)).toBe(5);
  });

  it("does not care which way round it is asked", () => {
    expect(distance(a, b)).toBe(distance(b, a));
  });

  it("is zero between a point and itself", () => {
    expect(distance(b, b)).toBe(0);
  });
});

describe("midpoint", () => {
  it("is halfway", () => {
    expect(midpoint(a, b)).toEqual({ x: 6, y: 8 });
  });

  it("is the same point when both are", () => {
    expect(midpoint(a, a)).toEqual(a);
  });

  it("does not care which way round it is asked", () => {
    expect(midpoint(a, b)).toEqual(midpoint(b, a));
  });
});
