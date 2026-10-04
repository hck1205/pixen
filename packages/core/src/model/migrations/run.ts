import { PixenError } from "../../errors/index.js";
import { SCHEMA_VERSION } from "../types.js";
import { MIGRATION_STEPS } from "./steps.js";

export type DocumentMigration = (document: Record<string, unknown>) => Record<string, unknown>;

/**
 * Every registered step, by the version it moves a document away from.
 *
 * A map rather than an array so a host can add one — `registerMigration` is the
 * seam for a document shape a host extended and has to bring forward too.
 */
export const migrations = new Map<number, DocumentMigration>(MIGRATION_STEPS);

export function registerMigration(fromVersion: number, migration: DocumentMigration): void {
  if (migrations.has(fromVersion)) {
    throw new PixenError("INVALID_STATE", `A migration from schema version ${fromVersion} is already registered`);
  }
  migrations.set(fromVersion, migration);
}

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
