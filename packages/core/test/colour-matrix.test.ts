import { describe, expect, it } from "vitest";
import {
  applyColourMatrix,
  COLOUR_MATRIX_LENGTH,
  IDENTITY_COLOUR_MATRIX,
  isColourMatrix,
  isIdentityColourMatrix,
} from "../src/render/colour-matrix.js";

/**
 * The twelve adjustments are a vocabulary. A brand look is not in it — a film
 * emulation, a house grade, a duotone keyed to two brand colours are each one
 * matrix and none of them is a slider.
 */
const pixel = (r: number, g: number, b: number, a = 255) => new Uint8ClampedArray([r, g, b, a]);
const read = (pixels: Uint8ClampedArray) => [...pixels];

describe("a colour matrix a host wrote", () => {
  it("leaves a picture alone when it is the identity", () => {
    const pixels = pixel(10, 120, 250);
    expect(applyColourMatrix(pixels, IDENTITY_COLOUR_MATRIX)).toBe(false);
    expect(read(pixels)).toEqual([10, 120, 250, 255]);
  });

  it("swaps channels when it is told to", () => {
    // Red and blue exchanged, green and alpha untouched.
    const swap = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0];
    const pixels = pixel(10, 120, 250);
    expect(applyColourMatrix(pixels, swap)).toBe(true);
    expect(read(pixels)).toEqual([250, 120, 10, 255]);
  });

  it("reads the constant as a fraction of full scale, the way a stylesheet does", () => {
    // +0.5 on red is half of 255, not half of one.
    const lift = [...IDENTITY_COLOUR_MATRIX];
    lift[4] = 0.5;
    const pixels = pixel(0, 0, 0);
    applyColourMatrix(pixels, lift);
    expect(read(pixels)[0]).toBe(128);
  });

  it("clamps rather than wrapping, because the buffer does", () => {
    const doubled = IDENTITY_COLOUR_MATRIX.map((value, index) => (index % 6 === 0 ? value * 4 : value));
    const pixels = pixel(200, 200, 200);
    applyColourMatrix(pixels, doubled);
    expect(read(pixels).slice(0, 3)).toEqual([255, 255, 255]);
  });

  it("reads every pixel from its own values, not from the one before", () => {
    // Channels are read out before any is written, so a matrix that mixes them
    // cannot feed on its own output within a pixel.
    const swap = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0];
    const pixels = new Uint8ClampedArray([1, 2, 3, 255, 250, 240, 230, 255]);
    applyColourMatrix(pixels, swap);
    expect(read(pixels)).toEqual([3, 2, 1, 255, 230, 240, 250, 255]);
  });

  it("can reach the alpha channel, which the named adjustments cannot", () => {
    const halveAlpha = [...IDENTITY_COLOUR_MATRIX];
    halveAlpha[18] = 0.5;
    const pixels = pixel(10, 10, 10, 200);
    applyColourMatrix(pixels, halveAlpha);
    expect(read(pixels)[3]).toBe(100);
  });

  it("refuses anything that is not twenty finite numbers", () => {
    expect(isColourMatrix(IDENTITY_COLOUR_MATRIX)).toBe(true);
    expect(isColourMatrix(new Array(COLOUR_MATRIX_LENGTH).fill(0))).toBe(true);
    expect(isColourMatrix(new Array(19).fill(0))).toBe(false);
    expect(isColourMatrix([...new Array(19).fill(0), Number.NaN])).toBe(false);
    expect(isColourMatrix("not a matrix")).toBe(false);
    expect(isColourMatrix(null)).toBe(false);
  });

  it("does nothing at all for a matrix it cannot read", () => {
    const pixels = pixel(10, 120, 250);
    expect(applyColourMatrix(pixels, [1, 2, 3])).toBe(false);
    expect(read(pixels)).toEqual([10, 120, 250, 255]);
  });

  it("knows the identity when it sees one", () => {
    expect(isIdentityColourMatrix([...IDENTITY_COLOUR_MATRIX])).toBe(true);
    const nearly = [...IDENTITY_COLOUR_MATRIX];
    nearly[0] = 0.999;
    expect(isIdentityColourMatrix(nearly)).toBe(false);
  });
});
