/**
 * Checking a stored document, by what each part answers.
 *
 * `combinators` is the vocabulary — a validator, a field, a default. `values`
 * is what a document is made of before it is a document: a point, a rect, a
 * range of time. `layers` is the table of what each kind of annotation stores.
 * `schema` is the document itself, and the one throwing boundary.
 */
export * from "./combinators.js";
export * from "./values.js";
export * from "./layers.js";
export * from "./schema.js";
