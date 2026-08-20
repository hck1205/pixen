import { describe, expect, it } from "vitest";
import { seedFrom, shuffleOrder } from "../src/render/scramble.js";

describe("seedFrom", () => {
  it("gives the same layer the same seed, every time", () => {
    expect(seedFrom("redact_a1b2")).toBe(seedFrom("redact_a1b2"));
  });

  it("gives different layers different seeds", () => {
    expect(seedFrom("redact_a1b2")).not.toBe(seedFrom("redact_a1b3"));
  });

  it("never returns zero, which would leave the generator stuck", () => {
    for (const text of ["", "a", "redact_", "  "]) {
      expect(seedFrom(text), text).not.toBe(0);
    }
  });
});

describe("shuffleOrder", () => {
  const COUNT = 64;

  /**
   * The whole reason the order is seeded: an editor whose preview does not
   * match the file it exports is broken, and both are drawn from the same
   * document by the same code.
   */
  it("is the same order for the same seed", () => {
    expect(shuffleOrder(COUNT, 12345)).toEqual(shuffleOrder(COUNT, 12345));
  });

  it("is a different order for a different seed", () => {
    expect(shuffleOrder(COUNT, 12345)).not.toEqual(shuffleOrder(COUNT, 54321));
  });

  it("is a permutation: every cell appears exactly once", () => {
    const order = shuffleOrder(COUNT, 999);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: COUNT }, (_, i) => i));
  });

  it("actually moves things, rather than returning what it was given", () => {
    const order = shuffleOrder(COUNT, 7);
    const stayed = order.filter((value, index) => value === index).length;
    // A random permutation of 64 leaves one cell in place on average.
    expect(stayed).toBeLessThan(COUNT / 4);
  });

  it("handles the degenerate grids without complaining", () => {
    expect(shuffleOrder(0, 1)).toEqual([]);
    expect(shuffleOrder(1, 1)).toEqual([0]);
    expect(shuffleOrder(-5, 1)).toEqual([]);
  });

  it("spreads cells rather than rotating them", () => {
    // A generator with a short cycle would move every cell by the same amount,
    // which is a shift and undoes in one step.
    const order = shuffleOrder(COUNT, 4242);
    const offsets = new Set(order.map((value, index) => value - index));
    expect(offsets.size).toBeGreaterThan(COUNT / 2);
  });
});
