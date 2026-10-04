/**
 * A result is a value or an error, as data.
 *
 * Pixen throws at its public boundary because that is what JavaScript hosts
 * expect. Internally, the parts that decide things — validation, history
 * transitions, the session reducer — return results instead, so their whole
 * behaviour is reachable from a unit test without try/catch scaffolding, and so
 * failures can be accumulated rather than lost at the first one.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Narrowing that reads as the question. Used across the test suites, where a
 * `Result` has to be unwrapped before anything can be asserted about it.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function map<T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
  return result.ok ? ok(transform(result.value)) : result;
}

/** Chains a fallible step; the first failure short-circuits. */
export function flatMap<T, U, E>(result: Result<T, E>, next: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? next(result.value) : result;
}

/** Crosses the boundary back into exception-land, at exactly one place per call site. */
export function getOrThrow<T, E>(result: Result<T, E>, toError: (error: E) => Error): T {
  if (result.ok) return result.value;
  throw toError(result.error);
}

/**
 * Turns a list of results into a result of a list, keeping **every** error.
 * Reporting all the problems with a document at once is the point.
 */
export function collect<T, E>(results: readonly Result<T, E>[]): Result<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];
  for (const result of results) {
    if (result.ok) values.push(result.value);
    else errors.push(result.error);
  }
  return errors.length > 0 ? err(errors) : ok(values);
}

/** Like `collect`, but each step may contribute several errors. */
export function collectAll<T, E>(results: readonly Result<T, E[]>[]): Result<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];
  for (const result of results) {
    if (result.ok) values.push(result.value);
    else errors.push(...result.error);
  }
  return errors.length > 0 ? err(errors) : ok(values);
}
