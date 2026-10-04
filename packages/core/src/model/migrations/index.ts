/**
 * Bringing a stored document forward.
 *
 * `steps` is the schema's own history — one function per version, in version
 * order. `run` is the walk that applies them and the two ways it refuses: a
 * document from a newer build, and a gap in the chain.
 *
 * Only the walk is re-exported. The step table is how the walk is assembled,
 * not something a host has any use for — `registerMigration` is the seam for a
 * host with a step of its own.
 */
export * from "./run.js";
