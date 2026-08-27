import { describe, expect, it } from "vitest";
import { clipTimeOf, nextKeptSecond } from "../src/player.js";

/**
 * A clip is not a file. Playing one means running each kept part and skipping
 * what is between, which is the part no media element can do — so where the
 * playhead *is* has two answers, and only one of them is the element's.
 */
describe("where the playhead is in the kept film", () => {
  const parts = [
    { start: 0, end: 10 },
    { start: 50, end: 60 },
  ];

  it("counts from the start of the first kept part", () => {
    expect(clipTimeOf(parts, 4)).toBe(4);
  });

  it("counts the parts before it in full", () => {
    // 10s of the first part, then 5s into the second.
    expect(clipTimeOf(parts, 55)).toBe(15);
  });

  it("counts a moment that was cut out as the start of whatever follows it", () => {
    // Nobody watching ever sees second 30, so it reads as the moment the
    // second part begins rather than as a position of its own.
    expect(clipTimeOf(parts, 30)).toBe(10);
  });

  it("stops at the total once the source runs past the last kept part", () => {
    expect(clipTimeOf(parts, 99)).toBe(20);
  });

  it("is zero before the first kept part begins", () => {
    expect(clipTimeOf([{ start: 5, end: 10 }], 0)).toBe(0);
  });
});

describe("the first second that is actually kept", () => {
  const parts = [
    { start: 0, end: 10 },
    { start: 50, end: 60 },
  ];

  it("leaves a second inside a kept part where it is", () => {
    expect(nextKeptSecond(parts, 7)).toBe(7);
  });

  it("moves a second in the gap forward to the next kept part", () => {
    // Where playing from there would have gone anyway.
    expect(nextKeptSecond(parts, 30)).toBe(50);
  });

  it("holds at the end when there is nothing kept after it", () => {
    expect(nextKeptSecond(parts, 99)).toBe(60);
  });

  it("moves up to the first part when asked for something before it", () => {
    expect(nextKeptSecond([{ start: 5, end: 10 }], 0)).toBe(5);
  });
});
