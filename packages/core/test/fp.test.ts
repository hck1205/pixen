import { describe, expect, it } from "vitest";
import {
  collect,
  collectAll,
  err,
  flatMap,
  flow,
  getOrThrow,
  identity,
  insertAt,
  isErr,
  isOk,
  map,
  mapError,
  moveItem,
  ok,
  pipe,
  removeAt,
  unwrapOr,
  updateAt,
} from "@pixen/core";

describe("Result", () => {
  it("distinguishes success from failure", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
    expect(isErr(err("boom"))).toBe(true);
  });

  it("maps a value and leaves an error alone", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
    expect(map(err("boom"), (n: number) => n * 3)).toEqual({ ok: false, error: "boom" });
  });

  it("maps an error and leaves a value alone", () => {
    expect(mapError(err(1), (n) => n + 1)).toEqual({ ok: false, error: 2 });
    expect(mapError(ok("v"), () => "other")).toEqual({ ok: true, value: "v" });
  });

  it("short-circuits a chain at the first failure", () => {
    const steps: string[] = [];
    const result = flatMap(err<string>("first"), () => {
      steps.push("ran");
      return ok(1);
    });
    expect(steps).toEqual([]);
    expect(isErr(result)).toBe(true);
  });

  it("chains successful steps", () => {
    const doubled = flatMap(ok(2), (n) => ok(n * 2));
    expect(doubled).toEqual({ ok: true, value: 4 });
  });

  it("falls back on failure", () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err("boom"), 9)).toBe(9);
  });

  it("crosses back into exceptions at one place", () => {
    expect(getOrThrow(ok(5), () => new Error("unused"))).toBe(5);
    expect(() => getOrThrow(err("boom"), (e) => new Error(String(e)))).toThrowError("boom");
  });
});

describe("collect", () => {
  it("returns every value when all succeed", () => {
    expect(collect([ok(1), ok(2)])).toEqual({ ok: true, value: [1, 2] });
  });

  it("keeps every error rather than the first", () => {
    const result = collect([ok(1), err("a"), err("b")]);
    expect(result).toEqual({ ok: false, error: ["a", "b"] });
  });

  it("treats an empty list as success", () => {
    expect(collect([])).toEqual({ ok: true, value: [] });
  });

  it("flattens grouped errors with collectAll", () => {
    const result = collectAll([ok(1), err(["a", "b"]), err(["c"])]);
    expect(result).toEqual({ ok: false, error: ["a", "b", "c"] });
  });
});

describe("pipe and flow", () => {
  it("applies left to right", () => {
    expect(pipe(2, (n: number) => n + 1, (n: number) => n * 10)).toBe(30);
  });

  it("returns the value unchanged with no steps", () => {
    expect(pipe(7)).toBe(7);
  });

  it("builds a reusable pipeline", () => {
    const shout = flow<string>((s) => s.trim(), (s) => s.toUpperCase(), (s) => `${s}!`);
    expect(shout("  hi ")).toBe("HI!");
    expect(shout("ok")).toBe("OK!");
  });

  it("identity returns its input", () => {
    const value = { a: 1 };
    expect(identity(value)).toBe(value);
  });
});

describe("array helpers", () => {
  const items = ["a", "b", "c"];

  it("updates one element without mutating the source", () => {
    const next = updateAt(items, 1, (item) => item.toUpperCase());
    expect(next).toEqual(["a", "B", "c"]);
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("ignores an out-of-range update but still copies", () => {
    const next = updateAt(items, 9, (item) => item.toUpperCase());
    expect(next).toEqual(items);
    expect(next).not.toBe(items);
  });

  it("inserts at a clamped index", () => {
    expect(insertAt(items, 0, "z")).toEqual(["z", "a", "b", "c"]);
    expect(insertAt(items, 99, "z")).toEqual(["a", "b", "c", "z"]);
    expect(insertAt(items, -5, "z")).toEqual(["z", "a", "b", "c"]);
  });

  it("removes at an index", () => {
    expect(removeAt(items, 1)).toEqual(["a", "c"]);
    expect(removeAt(items, 9)).toEqual(items);
  });

  it("moves an item forwards and backwards", () => {
    expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(items, 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("clamps a move past the end", () => {
    expect(moveItem(items, 0, 99)).toEqual(["b", "c", "a"]);
  });

  it("ignores a move from an invalid index", () => {
    expect(moveItem(items, 9, 0)).toEqual(items);
  });
});
