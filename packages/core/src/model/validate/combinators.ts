import { collectAll, err, isErr, ok, type Result } from "../../fp/result.js";

/**
 * The validator toolkit: primitives, and the ways of putting them together.
 *
 * Separate from the schema because these two answer different questions — *how*
 * do you describe a shape, and *what* shape is a Pixen document. The toolkit
 * knows nothing about images, and the schema next door reads as a declaration
 * rather than as a program.
 */
export interface ValidationIssue {
  /** JSON path into the document, e.g. `$.layers[2].frame.width`. */
  path: string;
  expected: string;
  received: unknown;
}

/**
 * A validator is a pure function from unknown data to a result carrying **every**
 * problem it found, not just the first. Composing them this way means a host
 * with three broken fields learns about three broken fields.
 */
export type Validator<T> = (value: unknown, path: string) => Result<T, ValidationIssue[]>;

/** Reads one property out of an already-validated object. */
export type FieldReader<T> = (source: Record<string, unknown>, path: string) => Result<T, ValidationIssue[]>;

/** One reader per property of `T`, which is what describes an object's shape. */
export type Fields<T extends object> = { [K in keyof T]: FieldReader<T[K]> };

export function issue(path: string, expected: string, received: unknown): ValidationIssue[] {
  return [{ path, expected, received }];
}

// --- primitives ------------------------------------------------------------

export const finiteNumber: Validator<number> = (value, path) =>
  typeof value === "number" && Number.isFinite(value)
    ? ok(value)
    : err(issue(path, "a finite number", value));

export const boolean: Validator<boolean> = (value, path) =>
  typeof value === "boolean" ? ok(value) : err(issue(path, "a boolean", value));

export const text: Validator<string> = (value, path) =>
  typeof value === "string" ? ok(value) : err(issue(path, "a string", value));

export function literalUnion<T extends string>(...allowed: T[]): Validator<T> {
  return (value, path) =>
    typeof value === "string" && (allowed as string[]).includes(value)
      ? ok(value as T)
      : err(issue(path, `one of ${allowed.join(", ")}`, value));
}

/** Applies `validator` unless the value is absent, in which case `fallback` is used. */
export function withDefault<T>(validator: Validator<T>, fallback: T): Validator<T> {
  return (value, path) => (value === undefined || value === null ? ok(fallback) : validator(value, path));
}

/** Applies `validator` unless the value is absent, in which case the result is null. */
export function nullable<T>(validator: Validator<T>): Validator<T | null> {
  return (value, path) => (value === undefined || value === null ? ok(null) : validator(value, path));
}

export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
  return (value, path) => (value === undefined ? ok(undefined) : validator(value, path));
}

export function arrayOf<T>(validator: Validator<T>): Validator<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) return err(issue(path, "an array", value));
    return collectAll(value.map((entry, index) => validator(entry, `${path}[${index}]`)));
  };
}

export function record(value: unknown, path: string): Result<Record<string, unknown>, ValidationIssue[]> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? ok(value as Record<string, unknown>)
    : err(issue(path, "an object", value));
}

/** A plain object, or an empty one — never a failure. */
export function recordOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// --- composing -------------------------------------------------------------

/**
 * Validates several fields of one object, gathering the issues from all of them.
 * Takes a record that has already been proved to be one; `object` is the form
 * that proves it.
 */
export function shape<T extends object>(
  source: Record<string, unknown>,
  path: string,
  fields: Fields<T>,
): Result<T, ValidationIssue[]> {
  const output = {} as T;
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(fields) as Array<keyof T>) {
    const result = fields[key](source, path);
    if (result.ok) output[key] = result.value;
    else issues.push(...result.error);
  }

  return issues.length > 0 ? err(issues) : ok(output);
}

/**
 * An object with these fields.
 *
 * The prove-it-is-a-record-then-read-its-fields pair was written out at every
 * shape in the schema; here it is once, which leaves each schema entry as a
 * list of its own fields and nothing else.
 */
export function object<T extends object>(fields: Fields<T>): Validator<T> {
  return (value, path) => {
    const asRecord = record(value, path);
    if (isErr(asRecord)) return asRecord;
    return shape(asRecord.value, path, fields);
  };
}

/** Reads one property with `validator`, extending the path for error reporting. */
export function field<T>(key: string, validator: Validator<T>): FieldReader<T> {
  return (source, path) => validator(source[key], `${path}.${key}`);
}

/** A field that is not read but written: a discriminant the shape already knows. */
export function constant<T>(value: T): FieldReader<T> {
  return () => ok(value);
}

/**
 * A nested object whose absence is not an error.
 *
 * Every field falls back to its own default, which is how a document written
 * before a whole section existed still loads.
 */
export function group<T extends object>(key: string, fields: Fields<T>): FieldReader<T> {
  return (source, path) => shape(recordOrEmpty(source[key]), `${path}.${key}`, fields);
}

export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((entry) => `${entry.path}: expected ${entry.expected}`).join("; ");
}
