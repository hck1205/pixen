import { describe, expect, it } from "vitest";
import { createDocument, History, PixenError } from "@pixen/core";

const base = createDocument({ resourceId: "res_1", width: 100, height: 100 });
const withCrop = (width: number) => ({ ...base, crop: { x: 0, y: 0, width, height: 50 } });

describe("History", () => {
  it("undoes and redoes atomic changes", () => {
    const history = new History();
    history.push("Crop", base, withCrop(10));
    expect(history.state().canUndo).toBe(true);

    expect(history.undo()).toEqual(base);
    expect(history.state().canRedo).toBe(true);
    expect(history.redo()).toEqual(withCrop(10));
  });

  it("collapses a whole gesture into one step", () => {
    const history = new History();
    history.begin("Drag crop", base);
    // Every pointermove pushes, but the open transaction swallows them.
    history.push("noise", base, withCrop(10));
    history.push("noise", withCrop(10), withCrop(20));
    expect(history.state().canUndo).toBe(false);

    expect(history.commit(withCrop(30))).toBe(true);
    expect(history.state().depth).toBe(1);
    expect(history.undo()).toEqual(base);
  });

  it("records nothing when a gesture ends where it started", () => {
    const history = new History();
    history.begin("Drag crop", base);
    expect(history.commit({ ...base })).toBe(false);
    expect(history.state().canUndo).toBe(false);
  });

  it("returns the pre-gesture document on rollback", () => {
    const history = new History();
    history.begin("Drag crop", base);
    expect(history.rollback()).toEqual(base);
    expect(history.state().inTransaction).toBe(false);
  });

  it("refuses nested transactions", () => {
    const history = new History();
    history.begin("first", base);
    expect(() => history.begin("second", base)).toThrowError(PixenError);
  });

  it("refuses to undo mid-gesture", () => {
    const history = new History();
    history.push("Crop", base, withCrop(10));
    history.begin("Drag", withCrop(10));
    expect(() => history.undo()).toThrowError(/transaction is open/);
  });

  it("clears the redo stack once a new change lands", () => {
    const history = new History();
    history.push("a", base, withCrop(10));
    history.undo();
    expect(history.state().canRedo).toBe(true);
    history.push("b", base, withCrop(20));
    expect(history.state().canRedo).toBe(false);
  });

  it("drops the oldest entry past its limit", () => {
    const history = new History({ limit: 2 });
    history.push("a", base, withCrop(10));
    history.push("b", withCrop(10), withCrop(20));
    history.push("c", withCrop(20), withCrop(30));
    expect(history.state().depth).toBe(2);
    expect(history.undo()).toEqual(withCrop(20));
    expect(history.undo()).toEqual(withCrop(10));
    expect(history.undo()).toBeNull();
  });

  it("labels the next undo and redo for the UI", () => {
    const history = new History();
    history.push("Crop", base, withCrop(10));
    expect(history.state().undoLabel).toBe("Crop");
    history.undo();
    expect(history.state().redoLabel).toBe("Crop");
  });
});
