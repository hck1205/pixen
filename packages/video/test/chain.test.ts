import { describe, expect, it } from "vitest";
import { PixenError } from "@pixen/core";
import { recorderChain } from "../src/encode.js";
import type { ClipRecorder } from "../src/encode.js";

/**
 * A browser that has `VideoEncoder` should use it, and one that has not should
 * still export something. Picking between them is a decision a host should not
 * have to write twice.
 */
const canvas = {} as HTMLCanvasElement;
const size = { width: 2, height: 2 };
const sound = { tracks: [] };

const recorder = (name: string): ClipRecorder =>
  ({ name, start: () => undefined, frame: () => undefined, finish: async () => new Blob(), cancel: () => undefined }) as unknown as ClipRecorder;

const refuses = (why: string) => () => {
  throw new PixenError("UNSUPPORTED_FORMAT", why);
};

describe("choosing an encoder", () => {
  it("takes the first that can be built", () => {
    const built = recorderChain(() => recorder("best"), () => recorder("fallback"))(canvas, size, sound);
    expect((built as unknown as { name: string }).name).toBe("best");
  });

  it("moves on when one cannot", () => {
    const built = recorderChain(refuses("no VideoEncoder here"), () => recorder("fallback"))(canvas, size, sound);
    expect((built as unknown as { name: string }).name).toBe("fallback");
  });

  it("reports the last one's reason, not the first one's", () => {
    // The last is the fallback — the one that was supposed to work anywhere —
    // so its failure is the one worth telling a host about.
    expect(() => recorderChain(refuses("no VideoEncoder here"), refuses("no MediaRecorder either"))(canvas, size, sound))
      .toThrow("no MediaRecorder either");
  });

  it("tries them in order rather than all at once", () => {
    const tried: string[] = [];
    const note = (name: string) => () => {
      tried.push(name);
      return recorder(name);
    };
    recorderChain(note("first"), note("second"))(canvas, size, sound);
    // The second is never built, because the first worked.
    expect(tried).toEqual(["first"]);
  });

  it("refuses a chain with nothing in it, rather than failing later", () => {
    expect(() => recorderChain()).toThrow(PixenError);
  });
});
