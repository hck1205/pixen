/**
 * The stickers a host offers.
 *
 * Pixen ships none: what a sticker *is* belongs to the product using it, and a
 * bundled set would be artwork this project would have to own, license and
 * defend. The host passes its own, and Pixen places them.
 */
export interface StickerDefinition {
  /** Stable id, so the same sticker is decoded once however often it is used. */
  id: string;
  /** Anything `editor.resources.load` accepts: a URL, a data URL, or a blob. */
  src: string | Blob;
  /** Shown as the button's accessible name. */
  label: string;
}

/**
 * Normalises the `stickers` property.
 *
 * Hosts pass a string (a URL), or an object with whatever fields they have, so
 * this fills in the rest rather than rejecting the shape. An entry with no
 * usable source is dropped: a button that cannot produce a sticker is worse than
 * no button.
 */
export function normaliseStickers(input: unknown): StickerDefinition[] {
  if (!Array.isArray(input)) return [];

  const stickers: StickerDefinition[] = [];
  for (const [index, entry] of input.entries()) {
    if (typeof entry === "string") {
      stickers.push({ id: entry, src: entry, label: labelFromSource(entry, index) });
      continue;
    }
    if (entry instanceof Blob) {
      stickers.push({ id: `sticker_${index}`, src: entry, label: `Sticker ${index + 1}` });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const record = entry as { id?: unknown; src?: unknown; url?: unknown; label?: unknown; name?: unknown };
    const src = record.src ?? record.url;
    if (typeof src !== "string" && !(src instanceof Blob)) continue;

    const label = typeof record.label === "string" ? record.label : typeof record.name === "string" ? record.name : null;
    stickers.push({
      id: typeof record.id === "string" ? record.id : typeof src === "string" ? src : `sticker_${index}`,
      src,
      label: label ?? (typeof src === "string" ? labelFromSource(src, index) : `Sticker ${index + 1}`),
    });
  }
  return stickers;
}

/** A readable name from a URL, so a host that passes bare strings still gets one. */
function labelFromSource(src: string, index: number): string {
  const withoutQuery = src.split("?")[0] ?? src;
  const file = withoutQuery.split("/").pop() ?? "";
  const name = file.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  return name === "" ? `Sticker ${index + 1}` : name;
}
