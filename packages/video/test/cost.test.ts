import { describe, expect, it } from "vitest";
import { createDocument, type EditorDocument } from "@pixen/core";
import { clipExportCost, LONG_EXPORT_SECONDS } from "../src/cost.js";
import { clipFilename, extensionForContainer } from "../src/naming.js";

const moving = (duration: number, clip: EditorDocument["clip"] = null): EditorDocument => {
  const base = createDocument({ resourceId: "res_1", width: 1920, height: 1080 });
  return { ...base, source: { ...base.source, duration, name: "interview.mp4" }, clip };
};

/**
 * Recording runs at wall-clock speed and cannot be asked to hurry, so a long
 * clip is a long wait — and a host that finds that out by starting one has
 * already committed a person to it.
 */
describe("what an export will cost", () => {
  it("is the kept seconds, not the source's", () => {
    const cost = clipExportCost(moving(600, [{ start: 10, end: 40 }]));
    expect(cost.seconds).toBe(30);
    expect(cost.parts).toBe(1);
  });

  it("counts the whole source when nothing is trimmed", () => {
    expect(clipExportCost(moving(90)).seconds).toBe(90);
  });

  it("charges for the seek between kept parts, because each one costs a moment", () => {
    const one = clipExportCost(moving(600, [{ start: 0, end: 30 }]));
    const three = clipExportCost(
      moving(600, [
        { start: 0, end: 10 },
        { start: 100, end: 110 },
        { start: 200, end: 210 },
      ]),
    );
    expect(three.seconds).toBe(30);
    expect(three.estimatedSeconds).toBeGreaterThan(one.estimatedSeconds);
  });

  it("calls a long one long, at the host's own threshold", () => {
    expect(clipExportCost(moving(600), 60).long).toBe(true);
    expect(clipExportCost(moving(30), 60).long).toBe(false);
  });

  it("uses a default threshold a host that names none can still read", () => {
    expect(clipExportCost(moving(LONG_EXPORT_SECONDS + 10)).long).toBe(true);
    expect(clipExportCost(moving(LONG_EXPORT_SECONDS - 10)).long).toBe(false);
  });

  it("costs a still picture nothing, because there is nothing to record", () => {
    const still = createDocument({ resourceId: "res_1", width: 8, height: 8 });
    expect(clipExportCost(still)).toEqual({ seconds: 0, estimatedSeconds: 0, parts: 0, long: false });
  });
});

/**
 * A still export has offered a filename since it existed; a clip came back as a
 * blob with a size and a type and no name at all.
 */
describe("what the exported clip is called", () => {
  it("keeps the source's own name, with the container's extension", () => {
    expect(clipFilename(moving(10), "video/webm;codecs=vp9,opus")).toBe("interview-edited.webm");
  });

  it("takes the container from the type, ignoring the codecs after it", () => {
    expect(extensionForContainer("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(extensionForContainer("video/mp4")).toBe("mp4");
  });

  it("names the two containers whose extension is not their subtype", () => {
    expect(extensionForContainer("video/x-matroska;codecs=avc1")).toBe("mkv");
    expect(extensionForContainer("video/quicktime")).toBe("mov");
  });

  it("guesses at what this package writes rather than at nothing", () => {
    expect(extensionForContainer("")).toBe("webm");
    expect(extensionForContainer("video/")).toBe("webm");
  });

  it("lets the caller name it outright", () => {
    expect(clipFilename(moving(10), "video/webm", "clip.webm")).toBe("clip.webm");
  });
});
