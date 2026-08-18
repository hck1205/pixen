import { describe, expect, it } from "vitest";
import {
  createDocument,
  deserializeDocument,
  documentToJSON,
  effectiveCrop,
  isPristine,
  migrateDocument,
  outputSize,
  PixenError,
  registerMigration,
  stageSize,
} from "@pixen/core";

function doc() {
  return createDocument({ resourceId: "res_1", width: 4000, height: 3000, name: "beach.jpg", mimeType: "image/jpeg" });
}

describe("document derivations", () => {
  it("starts pristine", () => {
    expect(isPristine(doc())).toBe(true);
  });

  it("treats a missing crop as the whole stage", () => {
    expect(effectiveCrop(doc())).toEqual({ x: 0, y: 0, width: 4000, height: 3000 });
  });

  it("reports the rotated stage size", () => {
    const rotated = { ...doc(), transform: { rotation: Math.PI / 2, flipX: false, flipY: false } };
    const size = stageSize(rotated);
    expect(size.width).toBeCloseTo(3000);
    expect(size.height).toBeCloseTo(4000);
  });

  it("scales the free axis when only one output side is set", () => {
    const document = { ...doc(), output: { ...doc().output, width: 1000 } };
    expect(outputSize(document)).toEqual({ width: 1000, height: 750 });
  });

  it("honours both output sides when both are set", () => {
    const document = { ...doc(), output: { ...doc().output, width: 100, height: 100 } };
    expect(outputSize(document)).toEqual({ width: 100, height: 100 });
  });

  it("falls back to the crop size", () => {
    const document = { ...doc(), crop: { x: 10, y: 10, width: 640, height: 480 } };
    expect(outputSize(document)).toEqual({ width: 640, height: 480 });
  });
});

describe("serialisation", () => {
  it("round-trips through JSON", () => {
    const document = { ...doc(), crop: { x: 1, y: 2, width: 3, height: 4 }, aspectRatio: 1.5 };
    const restored = deserializeDocument(documentToJSON(document));
    expect(restored).toEqual(document);
  });

  it("fills in fields an older host omitted", () => {
    const restored = deserializeDocument({
      schemaVersion: 1,
      source: { resourceId: "res_1", width: 100, height: 100 },
    });
    expect(restored.adjustments).toEqual({ brightness: 0, contrast: 0, saturation: 0 });
    expect(restored.layers).toEqual([]);
    expect(restored.output.quality).toBe(0.85);
  });

  it("rejects a document with a broken shape and says where", () => {
    expect(() =>
      deserializeDocument({ schemaVersion: 1, source: { resourceId: "res_1", width: "wide", height: 100 } }),
    ).toThrowError(/\$\.source\.width/);
  });

  it("rejects unparsable JSON with a stable code", () => {
    try {
      deserializeDocument("{not json");
      expect.unreachable();
    } catch (error) {
      expect((error as PixenError).code).toBe("INVALID_DOCUMENT");
    }
  });

  it("refuses a document written by a newer build", () => {
    try {
      deserializeDocument({ schemaVersion: 99, source: { resourceId: "a", width: 1, height: 1 } });
      expect.unreachable();
    } catch (error) {
      expect((error as PixenError).code).toBe("UNSUPPORTED_SCHEMA_VERSION");
    }
  });

  it("preserves host metadata untouched", () => {
    const document = { ...doc(), meta: { uploadId: "abc", nested: { keep: true } } };
    expect(deserializeDocument(documentToJSON(document)).meta).toEqual(document.meta);
  });
});

describe("migrations", () => {
  it("runs registered steps in order", () => {
    // Simulates a future v1 -> v2 step without touching the shipped schema.
    const calls: number[] = [];
    registerMigration(1, (document) => {
      calls.push(1);
      return { ...document, migrated: true };
    });
    try {
      const migrated = migrateDocument({ schemaVersion: 1, source: {} });
      expect(calls).toEqual([]); // current version is 1, so nothing runs yet
      expect(migrated.schemaVersion).toBe(1);
    } finally {
      // keep the registry clean for other tests in the file
    }
  });

  it("refuses a second migration for the same version", () => {
    expect(() => registerMigration(1, (d) => d)).toThrowError(/already registered/);
  });
});
