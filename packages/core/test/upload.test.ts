import { describe, expect, it } from "vitest";
import { uploadExport, uploadFields } from "../src/export/upload.js";
import type { ExportResult } from "../src/export/options.js";

const result: ExportResult = {
  blob: new Blob(["pixels"], { type: "image/jpeg" }),
  width: 800,
  height: 600,
  format: "image/jpeg",
  quality: 0.85,
  bytes: 6,
  filename: "photo-edited.jpg",
  sourceBytes: null,
  encodeAttempts: 1,
};

describe("uploadFields", () => {
  it("sends the file alone when the target asks for nothing else", () => {
    expect(uploadFields(result, { url: "/upload" })).toEqual([["file", result.blob, "photo-edited.jpg"]]);
  });

  it("lets a target name its own fields", () => {
    const fields = uploadFields(result, {
      url: "/upload",
      fields: (r) => [
        ["photo", r.blob],
        ["width", String(r.width)],
      ],
    });
    expect(fields).toEqual([
      ["photo", result.blob, "photo-edited.jpg"],
      ["width", "800"],
    ]);
  });

  /**
   * A multipart part with no filename reads as a text field to most servers,
   * and the upload quietly arrives without its extension.
   */
  it("gives a blob the export's filename when the target does not", () => {
    const [, , filename] = uploadFields(result, { url: "/upload", fields: (r) => [["photo", r.blob]] })[0]!;
    expect(filename).toBe("photo-edited.jpg");
  });

  it("keeps a filename the target chose", () => {
    const [, , filename] = uploadFields(result, {
      url: "/upload",
      fields: (r) => [["photo", r.blob, "avatar.jpg"]],
    })[0]!;
    expect(filename).toBe("avatar.jpg");
  });
});

describe("uploadExport", () => {
  it("says so rather than hanging when the environment cannot upload", async () => {
    // Node has FormData but no XMLHttpRequest; a browser has both.
    await expect(uploadExport(result, { url: "/upload" })).rejects.toMatchObject({ code: "UPLOAD_FAILED" });
  });

  it("refuses before opening a connection when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadExport(result, { url: "/upload" }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });
});
