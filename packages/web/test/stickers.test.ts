import { describe, expect, it } from "vitest";
import { normaliseStickers } from "../src/tools/stickers.js";

describe("normaliseStickers", () => {
  it("is empty when the host offered nothing", () => {
    expect(normaliseStickers(undefined)).toEqual([]);
    expect(normaliseStickers(null)).toEqual([]);
    expect(normaliseStickers("not a list")).toEqual([]);
  });

  it("accepts bare URLs and names them from the file", () => {
    expect(normaliseStickers(["/stickers/party-hat.svg"])).toEqual([
      { id: "/stickers/party-hat.svg", src: "/stickers/party-hat.svg", label: "party hat" },
    ]);
  });

  it("ignores a query string when reading the name", () => {
    expect(normaliseStickers(["/a/heart.png?v=2"])[0]!.label).toBe("heart");
  });

  it("takes src or url, and label or name", () => {
    const stickers = normaliseStickers([
      { id: "a", src: "/a.png", label: "Alpha" },
      { url: "/b.png", name: "Beta" },
    ]);
    expect(stickers[0]).toEqual({ id: "a", src: "/a.png", label: "Alpha" });
    expect(stickers[1]).toMatchObject({ src: "/b.png", label: "Beta" });
  });

  it("drops an entry with no usable source, rather than offering a dead button", () => {
    expect(normaliseStickers([{ label: "nothing behind me" }, 42, null, { src: "/ok.png" }])).toHaveLength(1);
  });

  it("falls back to a numbered label when a URL yields none", () => {
    expect(normaliseStickers(["/"])[0]!.label).toBe("Sticker 1");
  });
});
