/**
 * Getting an image out of a drop, a paste or a file picker.
 *
 * Three different DOM shapes carry the same intent, and each one has an empty
 * case that must not be mistaken for a file. Reading them here keeps the
 * element's listeners to one line each, and lets the empty cases be tested.
 */
export interface ClipboardItemLike {
  type: string;
  getAsFile(): File | null;
}

/** The first image in a `FileList`, or nothing. */
export function imageFromFiles(files: ArrayLike<File> | null | undefined): File | null {
  if (!files || files.length === 0) return null;
  const first = files[0];
  if (!first) return null;
  // A picker filtered to images can still yield an unknown type on some
  // platforms; the decoder rejects it later with a clear error.
  return first;
}

/** The first image on the clipboard. Text pastes carry items too, hence the filter. */
export function imageFromClipboard(items: ArrayLike<ClipboardItemLike> | null | undefined): File | null {
  if (!items) return null;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item?.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** True when a drag carries files, rather than text or an in-page selection. */
export function carriesFiles(types: readonly string[] | DOMStringList | null | undefined): boolean {
  if (!types) return false;
  return Array.from(types as ArrayLike<string>).includes("Files");
}
