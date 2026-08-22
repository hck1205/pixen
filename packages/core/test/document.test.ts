import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_KEYS,
  ADJUSTMENT_RANGES,
  DEFAULT_ADJUSTMENTS,
  createDocument,
  deserializeDocument,
  documentToJSON,
  effectiveCrop,
  isPristine,
  migrateDocument,
  outputSize,
  SCHEMA_VERSION,
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
    expect(restored.adjustments).toEqual(DEFAULT_ADJUSTMENTS);
    expect(restored.layers).toEqual([]);
    // A v1 document said nothing about quality, so it stays unsaid and the
    // format answers at export time. See `resolveQuality`.
    expect(restored.output.quality).toBeNull();
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
  it("carries a v1 document forward to the current version", () => {
    const migrated = migrateDocument({
      schemaVersion: 1,
      source: { resourceId: "res_1", width: 10, height: 10 },
    });
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("leaves a v1 document's own fields untouched", () => {
    const migrated = migrateDocument({
      schemaVersion: 1,
      source: { resourceId: "res_1", width: 10, height: 10 },
      crop: { x: 1, y: 2, width: 3, height: 4 },
      meta: { keep: true },
    });
    expect(migrated.crop).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(migrated.meta).toEqual({ keep: true });
  });

  it("fills the adjustments a v2 document did not have, keeping the ones it did", () => {
    const migrated = migrateDocument({
      schemaVersion: 2,
      source: { resourceId: "res_1", width: 10, height: 10 },
      adjustments: { brightness: 0.4, contrast: 0, saturation: 0 },
    });
    expect(migrated.adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, brightness: 0.4 });
  });

  it("gives a v1 document the whole neutral adjustment set on the way through", () => {
    const migrated = migrateDocument({
      schemaVersion: 1,
      source: { resourceId: "res_1", width: 10, height: 10 },
    });
    expect(migrated.adjustments).toEqual(DEFAULT_ADJUSTMENTS);
  });

  it("gives a v5 document the enlargement flag, defaulting to off", () => {
    // A v5 document exported through the panel did enlarge, so `true` would
    // preserve what it did. `false` is chosen anyway: the two paths disagreed,
    // only one can be right, and a stored document must mean the same thing
    // wherever it is read.
    const migrated = migrateDocument({
      schemaVersion: 5,
      source: { resourceId: "res_1", width: 10, height: 10 },
      output: { width: 40, height: null, format: null, quality: 0.85, background: null },
    });
    expect(migrated.output).toMatchObject({ width: 40, upscale: false });
  });

  it("leaves a flag a document already carries", () => {
    const migrated = migrateDocument({
      schemaVersion: 5,
      source: { resourceId: "res_1", width: 10, height: 10 },
      output: { upscale: true },
    });
    expect(migrated.output).toMatchObject({ upscale: true });
  });

  it("accepts a document already at the current version", () => {
    const migrated = migrateDocument({ schemaVersion: SCHEMA_VERSION, source: {} });
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("refuses a second migration for a version that already has one", () => {
    expect(() => registerMigration(1, (document) => document)).toThrowError(/already registered/);
  });
});

/**
 * `isPristine` is what disables the Reset button, so every edit has to count.
 *
 * Three of the nine adjustments were named here and the other six were not, so a
 * picture with only a vignette — or only a grayscale, sepia, invert, hue or
 * exposure — reported as untouched and left the user no way back from the
 * chrome. The frame, the clip and a chosen output format were missing for the
 * same reason: nothing here changed when they were added.
 *
 * The loop is over `ADJUSTMENT_KEYS` rather than a list of its own, so a tenth
 * adjustment is covered the day it exists.
 */
/**
 * A target larger than the picture only enlarges when it was asked to.
 *
 * The two paths disagreed: `resolveSize`, which the batch and variant calls
 * use, has refused to enlarge since it was written, and `outputSize` multiplied
 * whatever the panel typed. A stored document has to mean the same thing
 * wherever it is read, so the refusing one won and the other grew a flag.
 */
describe("outputSize", () => {
  const source = { resourceId: "res_1", width: 800, height: 600 };
  const sized = (patch: Record<string, unknown>) => {
    const document = createDocument(source);
    return outputSize({ ...document, output: { ...document.output, ...patch } });
  };

  it("keeps the cropped size when nothing was asked for", () => {
    expect(sized({})).toEqual({ width: 800, height: 600 });
  });

  it("shrinks to a smaller target, on either axis", () => {
    expect(sized({ width: 400 })).toEqual({ width: 400, height: 300 });
    expect(sized({ height: 300 })).toEqual({ width: 400, height: 300 });
    expect(sized({ width: 400, height: 200 })).toEqual({ width: 400, height: 200 });
  });

  it("refuses to enlarge, which is what the batch path has always done", () => {
    expect(sized({ width: 1600 })).toEqual({ width: 800, height: 600 });
    expect(sized({ height: 1200 })).toEqual({ width: 800, height: 600 });
  });

  it("enlarges exactly as asked once the document says to", () => {
    expect(sized({ width: 1600, upscale: true })).toEqual({ width: 1600, height: 1200 });
  });

  it("keeps the asked-for ratio when only one axis overshoots", () => {
    // 1600 x 300 on an 800 x 600 source: the width overshoots by 2, so both
    // halve. Clamping the width alone would silently change the shape.
    expect(sized({ width: 1600, height: 300 })).toEqual({ width: 800, height: 150 });
    // And the same when it is the height that overshoots, which is the half a
    // one-sided check would let through.
    expect(sized({ width: 200, height: 1200 })).toEqual({ width: 100, height: 600 });
  });
});

describe("isPristine", () => {
  const untouched = () => createDocument({ resourceId: "res_1", width: 800, height: 600, duration: 10 });

  it("is true for a document nothing has been done to", () => {
    expect(isPristine(untouched())).toBe(true);
  });

  it("notices every adjustment, not the three that were listed", () => {
    for (const key of ADJUSTMENT_KEYS) {
      const range = ADJUSTMENT_RANGES[key];
      // Something the control could actually produce, away from neutral.
      const value = range.neutral === range.max ? range.min : range.max;
      const adjusted = { ...untouched(), adjustments: { ...untouched().adjustments, [key]: value } };
      expect(isPristine(adjusted), `${key} = ${value}`).toBe(false);
    }
  });

  it("notices the edits that are not adjustments", () => {
    const cases: Array<[string, Partial<ReturnType<typeof untouched>>]> = [
      ["crop", { crop: { x: 0, y: 0, width: 10, height: 10 } }],
      ["clip", { clip: { start: 1, end: 2 } }],
      ["frame", { frame: { style: "solid", width: 0.02, colour: "#ffffff", radius: 0, inset: 0 } }],
      ["aspectRatio", { aspectRatio: 1 }],
      ["rotation", { transform: { rotation: 0.1, flipX: false, flipY: false } }],
      ["flipX", { transform: { rotation: 0, flipX: true, flipY: false } }],
    ];
    for (const [name, patch] of cases) {
      expect(isPristine({ ...untouched(), ...patch }), name).toBe(false);
    }
  });

  it("notices the output settings a host can change", () => {
    const output = untouched().output;
    for (const patch of [
      { width: 400 },
      { height: 400 },
      { format: "image/png" as const },
      { background: "#000" },
      { upscale: true },
    ]) {
      expect(isPristine({ ...untouched(), output: { ...output, ...patch } }), Object.keys(patch)[0]).toBe(false);
    }
  });
});
