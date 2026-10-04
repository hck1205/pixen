import { describe, expect, it } from "vitest";
import {
  collect,
  collectAll,
  err,
  flatMap,
  getOrThrow,
  insertAt,
  isErr,
  map,
  moveItem,
  ok,
  removeAt,
} from "@pixen/core";

describe("Result", () => {
  it("maps a value and leaves an error alone", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
    expect(map(err("boom"), (n: number) => n * 3)).toEqual({ ok: false, error: "boom" });
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

describe("array helpers", () => {
  const items = ["a", "b", "c"];

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
