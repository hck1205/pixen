/** Left-to-right application: `pipe(x, f, g)` is `g(f(x))`. */
export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(value: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(value: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
export function pipe<A, B, C, D, E>(
  value: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
export function pipe(value: unknown, ...fns: Array<(input: unknown) => unknown>): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}

/** Builds a reusable pipeline of same-typed steps — how document commands compose. */
export function flow<T>(...steps: ReadonlyArray<(value: T) => T>): (value: T) => T {
  return (value) => steps.reduce((acc, step) => step(acc), value);
}

export function identity<T>(value: T): T {
  return value;
}

/** Applies `transform` to the element at `index`, returning a new array. */
export function updateAt<T>(items: readonly T[], index: number, transform: (item: T) => T): T[] {
  if (index < 0 || index >= items.length) return [...items];
  return items.map((item, i) => (i === index ? transform(item) : item));
}

/** Inserts `item` at `index`, clamping the index into range. */
export function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const at = Math.min(Math.max(index, 0), items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  if (index < 0 || index >= items.length) return [...items];
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

/** Moves the item at `from` to `to`, clamping both. Returns a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  const item = items[from]!;
  return insertAt(removeAt(items, from), to, item);
}
