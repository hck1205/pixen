import { describe, expect, it } from "vitest";
import { carriesFiles, imageFromClipboard, imageFromFiles } from "../src/element/input/transfer.js";

const file = (name: string, type: string): File => ({ name, type }) as File;

describe("imageFromFiles", () => {
  it("takes the first file", () => {
    const first = file("a.jpg", "image/jpeg");
    expect(imageFromFiles([first, file("b.png", "image/png")])).toBe(first);
  });

  it("handles the empty cases a browser really produces", () => {
    expect(imageFromFiles(null)).toBeNull();
    expect(imageFromFiles(undefined)).toBeNull();
    expect(imageFromFiles([])).toBeNull();
  });
});

describe("imageFromClipboard", () => {
  const item = (type: string, result: File | null) => ({ type, getAsFile: () => result });

  it("finds the image among text items", () => {
    const png = file("pasted.png", "image/png");
    expect(imageFromClipboard([item("text/plain", null), item("image/png", png)])).toBe(png);
  });

  it("returns nothing for a text-only paste", () => {
    expect(imageFromClipboard([item("text/plain", null), item("text/html", null)])).toBeNull();
  });

  it("skips an image item that yields no file", () => {
    const png = file("second.png", "image/png");
    expect(imageFromClipboard([item("image/png", null), item("image/png", png)])).toBe(png);
  });

  it("survives an absent clipboard", () => {
    expect(imageFromClipboard(null)).toBeNull();
    expect(imageFromClipboard([])).toBeNull();
  });
});

describe("carriesFiles", () => {
  it("recognises a file drag", () => {
    expect(carriesFiles(["Files"])).toBe(true);
    expect(carriesFiles(["text/plain", "Files"])).toBe(true);
  });

  it("rejects a text drag, which would otherwise open the drop overlay", () => {
    expect(carriesFiles(["text/plain"])).toBe(false);
    expect(carriesFiles([])).toBe(false);
    expect(carriesFiles(undefined)).toBe(false);
  });
});
