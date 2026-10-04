/**
 * The directory structure inside an EXIF block.
 *
 * `jpeg.ts` finds the block; this walks what is in it. TIFF is a linked list of
 * directories, each a count followed by twelve-byte entries and a pointer to the
 * next. An entry names a tag, a type, how many of them, and then either the
 * value itself — if it fits in four bytes — or the offset of where it really is.
 * Every offset counts from the start of the block rather than the start of the
 * file, and the whole thing may be written either way round.
 *
 * Two callers need this and want opposite things from it: `exif.ts` reads one
 * tag out of a file it does not own, and `metadata.ts` rewrites a copy it does.
 * Both had their own walk, and the second was the one that had bothered to name
 * the offsets. Structure lives here now; what any particular tag *means* stays
 * with whoever cares.
 *
 * Nothing here trusts a count or an offset far enough to read outside the block:
 * the bytes come from a file a stranger may have written.
 */
const LITTLE_ENDIAN_MARK = 0x4949; // "II"
const BIG_ENDIAN_MARK = 0x4d4d; // "MM"
const TIFF_MAGIC = 0x002a;
/** Byte order, magic number, then the offset of the first directory. */
const HEADER_BYTES = 8;
const FIRST_DIRECTORY_AT = 4;

const ENTRY_BYTES = 12;
const ENTRY_COUNT_BYTES = 2;
const NEXT_DIRECTORY_BYTES = 4;
/** Where an entry keeps its type, its count, and its value or the offset of one. */
const TYPE_AT = 2;
const COUNT_AT = 4;
const VALUE_AT = 8;
/** A value this size or smaller is written into the entry instead of elsewhere. */
const INLINE_VALUE_BYTES = 4;

/** Bytes per component, by TIFF type code. An unknown type is left alone. */
const TYPE_BYTES: Readonly<Record<number, number>> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

export interface TiffBlock {
  bytes: Uint8Array;
  view: DataView;
  /** Offset of the TIFF header, which every offset inside the block counts from. */
  start: number;
  /** One past the last byte that belongs to this block. */
  end: number;
  littleEndian: boolean;
}

export interface TiffEntry {
  /** Offset of the entry itself. */
  at: number;
  tag: number;
  /** Where this entry's value lives and how long it is, wherever that may be. */
  valueAt: number;
  valueBytes: number;
}

/**
 * Reads the header, or `null` when these are not TIFF bytes.
 *
 * `bytes` is a view rather than a copy for a reader, and the buffer itself for a
 * rewriter — the erasing functions below write through it either way, so hand
 * over something you own if you mean to keep the original.
 */
export function readTiffBlock(bytes: Uint8Array, start: number, end = bytes.byteLength): TiffBlock | null {
  if (start < 0 || start + HEADER_BYTES > end || end > bytes.byteLength) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mark = view.getUint16(start, false);
  if (mark !== LITTLE_ENDIAN_MARK && mark !== BIG_ENDIAN_MARK) return null;

  const littleEndian = mark === LITTLE_ENDIAN_MARK;
  if (view.getUint16(start + TYPE_AT, littleEndian) !== TIFF_MAGIC) return null;
  return { bytes, view, start, end, littleEndian };
}

export function readShort(block: TiffBlock, at: number): number {
  return block.view.getUint16(at, block.littleEndian);
}

/** Every offset inside a block is a LONG counted from the block's start. */
export function readLong(block: TiffBlock, at: number): number {
  return block.view.getUint32(at, block.littleEndian);
}

function withinBlock(block: TiffBlock, at: number, length: number): boolean {
  return at >= block.start && length >= 0 && at + length <= block.end;
}

/** Offset of the first directory, or `null` if it does not sit inside the block. */
export function firstDirectory(block: TiffBlock): number | null {
  const at = block.start + readLong(block, block.start + FIRST_DIRECTORY_AT);
  return withinBlock(block, at, ENTRY_COUNT_BYTES) ? at : null;
}

/**
 * Where a directory keeps the offset of the one after it — the location, not the
 * value, because a caller that wants there to be no next directory writes a zero
 * here.
 */
export function nextDirectoryPointer(block: TiffBlock, directory: number): number | null {
  if (!withinBlock(block, directory, ENTRY_COUNT_BYTES)) return null;
  const at = directory + ENTRY_COUNT_BYTES + readShort(block, directory) * ENTRY_BYTES;
  return withinBlock(block, at, NEXT_DIRECTORY_BYTES) ? at : null;
}

/** The directory a pointer leads to, or `null` for "there is not one". */
export function directoryAt(block: TiffBlock, pointer: number): number | null {
  const at = block.start + readLong(block, pointer);
  return at !== block.start && withinBlock(block, at, ENTRY_COUNT_BYTES) ? at : null;
}

/** The entries of one directory, or none at all if its count reaches outside the block. */
function entriesOf(block: TiffBlock, directory: number): TiffEntry[] {
  if (!withinBlock(block, directory, ENTRY_COUNT_BYTES)) return [];
  const count = readShort(block, directory);
  if (!withinBlock(block, directory, directoryBytes(count))) return [];

  return Array.from({ length: count }, (_, index) => {
    const at = directory + ENTRY_COUNT_BYTES + index * ENTRY_BYTES;
    const size = TYPE_BYTES[readShort(block, at + TYPE_AT)];
    const valueBytes = size === undefined ? 0 : size * readLong(block, at + COUNT_AT);
    return {
      at,
      tag: readShort(block, at),
      valueAt: valueBytes <= INLINE_VALUE_BYTES ? at + VALUE_AT : block.start + readLong(block, at + VALUE_AT),
      valueBytes,
    };
  });
}

export function findEntry(block: TiffBlock, directory: number, tag: number): TiffEntry | undefined {
  return entriesOf(block, directory).find((entry) => entry.tag === tag);
}

/** Zeroes a range, ignoring one that does not sit inside the block. */
export function eraseRange(block: TiffBlock, at: number, length: number): void {
  if (length > 0 && withinBlock(block, at, length)) block.bytes.fill(0, at, at + length);
}

/** Zeroes a directory: its entries, and every value stored outside them. */
export function eraseDirectory(block: TiffBlock, directory: number): void {
  const entries = entriesOf(block, directory);
  for (const entry of entries) {
    if (entry.valueBytes > INLINE_VALUE_BYTES) eraseRange(block, entry.valueAt, entry.valueBytes);
  }
  eraseRange(block, directory, directoryBytes(entries.length));
}

/**
 * Drops one entry, by sliding the ones after it down and telling the directory
 * it is one shorter.
 *
 * The block does not get smaller. Values live at absolute offsets elsewhere and
 * are undisturbed by the slide, so leaving twelve dead bytes at the end of the
 * entries is far cheaper than recalculating every offset in the block to close
 * the gap — and nothing reads them, because a reader finds the end of the
 * entries by the count.
 *
 * Erasing what the entry pointed at is the caller's business: an entry is not
 * always the only way to the bytes it names, and this cannot know.
 */
export function removeEntry(block: TiffBlock, directory: number, entry: TiffEntry): void {
  const count = readShort(block, directory);
  const entriesEnd = directory + ENTRY_COUNT_BYTES + count * ENTRY_BYTES;
  const tailAt = entry.at + ENTRY_BYTES;
  const tailBytes = entriesEnd + NEXT_DIRECTORY_BYTES - tailAt;
  if (tailBytes < 0 || !withinBlock(block, tailAt, tailBytes)) return;

  block.bytes.copyWithin(entry.at, tailAt, tailAt + tailBytes);
  block.view.setUint16(directory, count - 1, block.littleEndian);
}

/** Overwrites an entry's value, for one that is a single SHORT and so inline. */
export function writeShortValue(block: TiffBlock, entry: TiffEntry, value: number): void {
  block.view.setUint16(entry.at + VALUE_AT, value, block.littleEndian);
}

function directoryBytes(count: number): number {
  return ENTRY_COUNT_BYTES + count * ENTRY_BYTES + NEXT_DIRECTORY_BYTES;
}
