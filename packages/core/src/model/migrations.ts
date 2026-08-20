import { PixenError } from "../errors/index.js";
import { DEFAULT_ADJUSTMENTS, SCHEMA_VERSION } from "./types.js";

export type DocumentMigration = (document: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations from schema version N to N+1, keyed by N.
 *
 * The stored document is a public contract the moment a customer writes it to a
 * database, so version 1 ships with the migration table already in place —
 * adding it later is what makes old documents unreadable.
 */
export const migrations = new Map<number, DocumentMigration>();

/**
 * v1 -> v2 added the `image` and `redact` layer types.
 *
 * Nothing in a v1 document changes, but the version still moves: a v1 build
 * reading a v2 document would reject the new layers, and failing loudly beats
 * dropping a redaction on the floor.
 */
function migrateV1ToV2(document: Record<string, unknown>): Record<string, unknown> {
  return document;
}

/**
 * v2 -> v3 widened `adjustments` from three values to nine.
 *
 * The new ones default to neutral, so a v2 document looks exactly as it did;
 * filling them in here rather than at read time means one shape reaches the
 * renderer, whatever version the document arrived as.
 */
function migrateV2ToV3(document: Record<string, unknown>): Record<string, unknown> {
  const stored = document.adjustments;
  const adjustments = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  return {
    ...document,
    adjustments: { ...DEFAULT_ADJUSTMENTS, ...adjustments },
  };
}

/**
 * v3 -> v4 added the optional `frame`.
 *
 * A v3 document had no frame, and `null` is exactly that, so this is a default
 * rather than a change of meaning.
 */
function migrateV3ToV4(document: Record<string, unknown>): Record<string, unknown> {
  return { frame: null, ...document };
}

/**
 * v4 -> v5 added the optional `clip`, the time range of a moving source.
 *
 * A v4 document is a still picture, and `null` is exactly "all of it", so this
 * is a default rather than a change of meaning — the same shape as the frame
 * before it. It is spread *after* the default so a document that somehow
 * already carries one keeps it.
 */
function migrateV4ToV5(document: Record<string, unknown>): Record<string, unknown> {
  return { clip: null, ...document };
}

export function registerMigration(fromVersion: number, migration: DocumentMigration): void {
  if (migrations.has(fromVersion)) {
    throw new PixenError("INVALID_STATE", `A migration from schema version ${fromVersion} is already registered`);
  }
  migrations.set(fromVersion, migration);
}

/** Upgrades a raw document to the current schema version, or explains why it can't. */
migrations.set(1, migrateV1ToV2);
migrations.set(2, migrateV2ToV3);
migrations.set(3, migrateV3ToV4);
migrations.set(4, migrateV4ToV5);

export function migrateDocument(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PixenError("INVALID_DOCUMENT", "Document must be an object");
  }

  let current = { ...(raw as Record<string, unknown>) };
  const version = current.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new PixenError("INVALID_DOCUMENT", "Document is missing a valid schemaVersion", {
      details: { schemaVersion: version },
    });
  }

  if (version > SCHEMA_VERSION) {
    throw new PixenError(
      "UNSUPPORTED_SCHEMA_VERSION",
      `Document schema version ${version} is newer than this build supports (${SCHEMA_VERSION}). Upgrade @pixen/core.`,
      { details: { documentVersion: version, supportedVersion: SCHEMA_VERSION } },
    );
  }

  let at = version;
  while (at < SCHEMA_VERSION) {
    const migration = migrations.get(at);
    if (!migration) {
      throw new PixenError(
        "UNSUPPORTED_SCHEMA_VERSION",
        `No migration registered from schema version ${at} to ${at + 1}`,
        { details: { from: at, to: at + 1 } },
      );
    }
    current = migration(current);
    current.schemaVersion = at + 1;
    at += 1;
  }

  return current;
}
