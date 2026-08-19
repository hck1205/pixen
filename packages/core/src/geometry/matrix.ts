import type { Matrix, Point } from "./types.js";

export const IDENTITY: Readonly<Matrix> = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export function matrix(a: number, b: number, c: number, d: number, e: number, f: number): Matrix {
  return { a, b, c, d, e, f };
}

/** `left · right` — the result applies `right` first, then `left`. */
export function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

export function compose(...matrices: Matrix[]): Matrix {
  return matrices.reduce<Matrix>((acc, m) => multiply(acc, m), { ...IDENTITY });
}

export function translation(tx: number, ty: number): Matrix {
  return matrix(1, 0, 0, 1, tx, ty);
}

export function scaling(sx: number, sy: number = sx): Matrix {
  return matrix(sx, 0, 0, sy, 0, 0);
}

export function rotation(radians: number): Matrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return matrix(cos, sin, -sin, cos, 0, 0);
}

function determinant(m: Matrix): number {
  return m.a * m.d - m.b * m.c;
}

export function invert(m: Matrix): Matrix {
  const det = determinant(m);
  if (det === 0 || !Number.isFinite(det)) {
    throw new RangeError("Matrix is not invertible");
  }
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function applyToPoint(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}


/** Uniform-ish scale factor of the matrix, used for hit-test tolerances and line widths. */
export function meanScale(m: Matrix): number {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  return (sx + sy) / 2;
}

export function matrixEquals(a: Matrix, b: Matrix, epsilon = 1e-9): boolean {
  return (
    Math.abs(a.a - b.a) <= epsilon &&
    Math.abs(a.b - b.b) <= epsilon &&
    Math.abs(a.c - b.c) <= epsilon &&
    Math.abs(a.d - b.d) <= epsilon &&
    Math.abs(a.e - b.e) <= epsilon &&
    Math.abs(a.f - b.f) <= epsilon
  );
}

/** Serializes to the argument order of `CanvasRenderingContext2D.setTransform`. */
export function toArray(m: Matrix): [number, number, number, number, number, number] {
  return [m.a, m.b, m.c, m.d, m.e, m.f];
}
