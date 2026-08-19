import { PixenError } from "../errors/index.js";
import { SCHEMA_VERSION } from "./types.js";

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

export function registerMigration(fromVersion: number, migration: DocumentMigration): void {
  if (migrations.has(fromVersion)) {
    throw new PixenError("INVALID_STATE", `A migration from schema version ${fromVersion} is already registered`);
  }
  migrations.set(fromVersion, migration);
}

/** Upgrades a raw document to the current schema version, or explains why it can't. */
migrations.set(1, migrateV1ToV2);

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
