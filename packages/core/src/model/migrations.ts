import { PixenError } from "../errors/index.js";
import { DEFAULT_FRAME } from "./defaults.js";
import { DEFAULT_LAYER_SPACE } from "./defaults.js";
import { DEFAULT_ADJUSTMENTS, DEFAULT_CROP_WITHIN_IMAGE, DEFAULT_OUTPUT, SCHEMA_VERSION } from "./types.js";

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

/**
 * v5 -> v6 added `output.upscale`, and let `output.quality` be unset.
 *
 * Two changes to the same object, in one version because they ship together.
 *
 * A v5 document exported through the panel *did* enlarge when its output size
 * was larger than the source, so `true` would preserve what those documents did
 * — and `false` is chosen anyway. The two paths disagreed, only one of them can
 * be right, and a stored document should mean the same thing wherever it is
 * read. A host that was relying on the enlargement sets the flag.
 *
 * The quality is left exactly as it was found. A v5 document carries an
 * explicit number, and turning that into "unset" would quietly re-encode
 * somebody's archive at a different size the next time it was opened. Only a
 * new document starts unset, and only then does the format choose.
 */
function migrateV5ToV6(document: Record<string, unknown>): Record<string, unknown> {
  const stored = document.output;
  const output = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  return { ...document, output: { upscale: false, ...output } };
}

/**
 * v6 -> v7 replaced a line's two booleans with two named decorations.
 *
 * `arrowStart: true` drew a *filled* head, so it becomes `arrow-solid` rather
 * than `arrow` — the open one is a new drawing, and a migration that quietly
 * restyled every arrow in a customer's archive would be a worse bug than the
 * one it fixed. False becomes `none`, which is what it drew.
 *
 * The old fields are dropped rather than carried: they are the same information
 * in a shape the renderer no longer reads, and leaving them would mean two
 * answers to what is on the end of a line.
 */
function migrateV6ToV7(document: Record<string, unknown>): Record<string, unknown> {
  const layers = Array.isArray(document.layers) ? document.layers : [];
  return {
    ...document,
    layers: layers.map((raw) => {
      if (typeof raw !== "object" || raw === null) return raw;
      const layer = raw as Record<string, unknown>;
      if (layer.type !== "line") return layer;
      const { arrowStart, arrowEnd, ...rest } = layer;
      return {
        ...rest,
        startStyle: rest.startStyle ?? (arrowStart === true ? "arrow-solid" : "none"),
        endStyle: rest.endStyle ?? (arrowEnd === true ? "arrow-solid" : "none"),
      };
    }),
  };
}

/**
 * v7 -> v8 gave the frame the three measurements its new treatments need.
 *
 * A v7 document has one of the three rectangles, which read none of them, so
 * this is a default rather than a change of meaning — the same shape as the
 * frame's own arrival in v4. Spread after the defaults, so a document that
 * somehow carries them keeps what it has.
 */
function migrateV7ToV8(document: Record<string, unknown>): Record<string, unknown> {
  const stored = document.frame;
  if (typeof stored !== "object" || stored === null) return document;
  return {
    ...document,
    frame: {
      offset: DEFAULT_FRAME.offset,
      count: DEFAULT_FRAME.count,
      armLength: DEFAULT_FRAME.armLength,
      ...(stored as Record<string, unknown>),
    },
  };
}

/**
 * v8 -> v9 added gamma and the two white-balance axes.
 *
 * Their neutral is zero like everything else's, so filling them in leaves a v8
 * document looking exactly as it did — the same shape as the widening in v3.
 * The version still moves, because a v8 build reading a v9 document would
 * ignore three adjustments and draw a different picture in silence.
 */
function migrateV8ToV9(document: Record<string, unknown>): Record<string, unknown> {
  const stored = document.adjustments;
  const adjustments = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  return { ...document, adjustments: { ...DEFAULT_ADJUSTMENTS, ...adjustments } };
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
migrations.set(5, migrateV5ToV6);
migrations.set(6, migrateV6ToV7);
migrations.set(7, migrateV7ToV8);
migrations.set(8, migrateV8ToV9);
migrations.set(9, migrateV9ToV10);
migrations.set(10, migrateV10ToV11);
migrations.set(11, migrateV11ToV12);
migrations.set(12, migrateV12ToV13);

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

/**
 * v9 -> v10 let a document keep more than one part of a moving source.
 *
 * One range was the whole of trimming until it was not: a talk with two good
 * answers in it, an interview with the pauses taken out. A v9 document has one
 * range, which means one kept part, so it becomes a list of one and looks
 * exactly as it did. The version still moves, because a v9 build reading a v10
 * document would find a list where it expects a range and export the wrong film
 * — or nothing.
 */
function migrateV9ToV10(document: Record<string, unknown>): Record<string, unknown> {
  const stored = document.clip;
  if (stored === null || stored === undefined || Array.isArray(stored)) return document;
  return { ...document, clip: [stored] };
}

/**
 * v10 -> v11 gave every layer a frame of reference.
 *
 * Every layer a v10 document holds is in the picture's own pixels — that was
 * the only kind there was — so filling `image` in leaves it looking exactly as
 * it did. The version still moves, because a v10 build reading a v11 document
 * would draw an `output` layer as though it belonged to the picture: turned
 * with a rotation it should have ignored, and in the wrong place.
 */
function migrateV10ToV11(document: Record<string, unknown>): Record<string, unknown> {
  const layers = Array.isArray(document.layers) ? document.layers : [];
  return {
    ...document,
    layers: layers.map((raw) => {
      if (typeof raw !== "object" || raw === null) return raw;
      const layer = raw as Record<string, unknown>;
      return { space: DEFAULT_LAYER_SPACE, ...layer };
    }),
  };
}

/**
 * v11 -> v12 let a crop hang off the picture, and put a bitmap behind it.
 *
 * A v11 document's crop was always inside the picture and there was never a
 * backdrop, so filling those in leaves it looking exactly as it did. The
 * version moves because a v11 build reading a v12 document would clamp a crop
 * that was meant to overhang — cutting the export down to the picture — and
 * would drop the backdrop without saying so.
 */
function migrateV11ToV12(document: Record<string, unknown>): Record<string, unknown> {
  const stored = document.output;
  const output = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  return {
    cropWithinImage: DEFAULT_CROP_WITHIN_IMAGE,
    ...document,
    output: {
      backgroundImage: DEFAULT_OUTPUT.backgroundImage,
      backgroundFilter: DEFAULT_OUTPUT.backgroundFilter,
      ...output,
    },
  };
}

/**
 * v12 -> v13 added the retouch layer.
 *
 * Nothing to fill in: a v12 document simply has none. The version moves because
 * a v12 build reading a v13 document would meet a layer kind it has no case for
 * — and an unhandled kind is a blemish left in a picture somebody thought they
 * had repaired, which is worse than an error.
 */
function migrateV12ToV13(document: Record<string, unknown>): Record<string, unknown> {
  return document;
}
