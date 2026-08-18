import { describe, expect, it } from "vitest";
import {
  createDocument,
  formatIssues,
  isErr,
  isOk,
  parseDocument,
  validateDocument,
  validators,
  type PixenError,
} from "@pixen/core";

const { arrayOf, boolean, finiteNumber, literalUnion, nullable, point, rect, text, withDefault } = validators;

const validSource = { resourceId: "res_1", width: 100, height: 50 };
const minimal = { schemaVersion: 1, source: validSource };

describe("primitive validators", () => {
  it("accepts finite numbers only", () => {
    expect(isOk(finiteNumber(1.5, "$.x"))).toBe(true);
    expect(isErr(finiteNumber(Number.NaN, "$.x"))).toBe(true);
    expect(isErr(finiteNumber(Infinity, "$.x"))).toBe(true);
    expect(isErr(finiteNumber("1", "$.x"))).toBe(true);
  });

  it("reports the path and the expectation", () => {
    const result = finiteNumber("wide", "$.source.width");
    if (!isErr(result)) throw new Error("expected failure");
    expect(result.error).toEqual([{ path: "$.source.width", expected: "a finite number", received: "wide" }]);
  });

  it("checks booleans and strings", () => {
    expect(isOk(boolean(false, "$"))).toBe(true);
    expect(isErr(boolean("false", "$"))).toBe(true);
    expect(isOk(text("", "$"))).toBe(true);
    expect(isErr(text(1, "$"))).toBe(true);
  });

  it("restricts a union", () => {
    const align = literalUnion("left", "center", "right");
    expect(isOk(align("center", "$"))).toBe(true);
    expect(isErr(align("middle", "$"))).toBe(true);
  });

  it("substitutes a default for an absent value", () => {
    const result = withDefault(finiteNumber, 42)(undefined, "$");
    expect(result).toEqual({ ok: true, value: 42 });
    expect(withDefault(finiteNumber, 42)(null, "$")).toEqual({ ok: true, value: 42 });
  });

  it("still validates a value that is present", () => {
    expect(isErr(withDefault(finiteNumber, 42)("nope", "$"))).toBe(true);
  });

  it("maps an absent value to null when nullable", () => {
    expect(nullable(finiteNumber)(undefined, "$")).toEqual({ ok: true, value: null });
  });
});

describe("structural validators", () => {
  it("validates points and rects", () => {
    expect(isOk(point({ x: 1, y: 2 }, "$"))).toBe(true);
    expect(isErr(point({ x: 1 }, "$"))).toBe(true);
    expect(isOk(rect({ x: 0, y: 0, width: 1, height: 1 }, "$"))).toBe(true);
  });

  it("rejects a negative rect size", () => {
    const result = rect({ x: 0, y: 0, width: -1, height: 1 }, "$.crop");
    if (!isErr(result)) throw new Error("expected failure");
    expect(result.error[0]!.expected).toMatch(/non-negative/);
  });

  it("reports both missing coordinates at once", () => {
    const result = point({}, "$.from");
    if (!isErr(result)) throw new Error("expected failure");
    expect(result.error.map((entry) => entry.path)).toEqual(["$.from.x", "$.from.y"]);
  });

  it("indexes array elements in the path", () => {
    const result = arrayOf(finiteNumber)([1, "two", 3], "$.points");
    if (!isErr(result)) throw new Error("expected failure");
    expect(result.error[0]!.path).toBe("$.points[1]");
  });
});

describe("validateDocument", () => {
  it("accepts a freshly created document", () => {
    const document = createDocument({ resourceId: "res_1", width: 10, height: 10 });
    const result = validateDocument(JSON.parse(JSON.stringify(document)));
    expect(isOk(result)).toBe(true);
  });

  it("fills in everything an older host omitted", () => {
    const result = validateDocument(minimal);
    if (!isOk(result)) throw new Error(formatIssues(result.error));
    expect(result.value.adjustments).toEqual({ brightness: 0, contrast: 0, saturation: 0 });
    expect(result.value.layers).toEqual([]);
    expect(result.value.output.quality).toBe(0.85);
    expect(result.value.crop).toBeNull();
  });

  it("reports every broken field, not just the first", () => {
    const result = validateDocument({
      schemaVersion: "one",
      source: { resourceId: 5, width: "wide", height: 50 },
      transform: { rotation: "sideways" },
    });
    if (!isErr(result)) throw new Error("expected failure");
    expect(result.error.map((entry) => entry.path).sort()).toEqual([
      "$.schemaVersion",
      "$.source.resourceId",
      "$.source.width",
      "$.transform.rotation",
    ]);
  });

  it("names the offending layer by index", () => {
    const result = validateDocument({
      ...minimal,
      layers: [{ id: "a", type: "rect", frame: { x: 0, y: 0, width: 1, height: 1 } }, { id: "b", type: "wormhole" }],
    });
    if (!isErr(result)) throw new Error("expected failure");
    expect(result.error[0]!.path).toBe("$.layers[1].type");
  });

  it("normalises layer defaults", () => {
    const result = validateDocument({
      ...minimal,
      layers: [{ id: "a", type: "path", points: [{ x: 0, y: 0 }] }],
    });
    if (!isOk(result)) throw new Error(formatIssues(result.error));
    expect(result.value.layers[0]).toMatchObject({ visible: true, locked: false, opacity: 1, closed: false });
  });

  it("rejects an unknown output format", () => {
    const result = validateDocument({ ...minimal, output: { format: "image/heic" } });
    if (!isErr(result)) throw new Error("expected failure");
    expect(result.error[0]!.path).toBe("$.output.format");
  });

  it("passes host metadata through untouched", () => {
    const result = validateDocument({ ...minimal, meta: { uploadId: "abc", nested: { keep: true } } });
    if (!isOk(result)) throw new Error(formatIssues(result.error));
    expect(result.value.meta).toEqual({ uploadId: "abc", nested: { keep: true } });
  });

  it("ignores a meta field of the wrong shape rather than failing", () => {
    const result = validateDocument({ ...minimal, meta: "nonsense" });
    if (!isOk(result)) throw new Error(formatIssues(result.error));
    expect(result.value.meta).toEqual({});
  });
});

describe("parseDocument", () => {
  it("returns the document when it is valid", () => {
    expect(parseDocument(minimal).source.resourceId).toBe("res_1");
  });

  it("throws with every issue attached", () => {
    try {
      parseDocument({ schemaVersion: 1, source: { resourceId: "a", width: "x", height: "y" } });
      expect.unreachable();
    } catch (error) {
      const pixenError = error as PixenError;
      expect(pixenError.code).toBe("INVALID_DOCUMENT");
      expect(pixenError.message).toMatch(/\$\.source\.width/);
      expect((pixenError.details.issues as unknown[]).length).toBe(2);
    }
  });

  it("formats issues for a human", () => {
    expect(formatIssues([{ path: "$.x", expected: "a number", received: null }])).toBe("$.x: expected a number");
  });
});
