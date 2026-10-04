/**
 * What the exported clip is called.
 *
 * A still export has offered a filename since it existed; a clip came back as a
 * blob with a size and a type and no name at all, so a host saving one or
 * putting it on a wire had to invent one. The rule is the still export's, for
 * the same reason it has one: the file a person gets back should be recognisably
 * the file they brought in.
 */
import type { EditorDocument } from "@pixen/core";

/** What a container with no extension we know is called. */
const FALLBACK_EXTENSION = "webm";

/** What a source with no name of its own is called. */
const FALLBACK_NAME = "video";

/**
 * The extension for a recorded container.
 *
 * The type carries its codecs — `video/webm;codecs=vp9,opus` — and the part
 * before the semicolon is the container, which is what an extension names. A
 * subtype we do not recognise still gives a better guess than nothing: `webm`
 * for anything we cannot place, because that is what this package writes.
 */
export function extensionForContainer(type: string): string {
  const subtype = type.split(";")[0]?.split("/")[1]?.trim().toLowerCase();
  if (!subtype) return FALLBACK_EXTENSION;
  if (subtype === "x-matroska") return "mkv";
  if (subtype === "quicktime") return "mov";
  return /^[a-z0-9]+$/.test(subtype) ? subtype : FALLBACK_EXTENSION;
}

/** The name the exported clip is offered under. */
export function clipFilename(document: EditorDocument, type: string, override?: string): string {
  if (override) return override;
  const source = document.source.name ?? FALLBACK_NAME;
  const base = source.replace(/\.[^.]+$/, "") || FALLBACK_NAME;
  return `${base}-edited.${extensionForContainer(type)}`;
}
