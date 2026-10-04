/**
 * Rearranging a mosaic so it cannot be put back.
 *
 * Reducing a region to blocks already destroys what was inside each block —
 * averaging pixels is not invertible. What it leaves is the *arrangement*, and
 * that is enough: a known font over a known layout can be brute-forced block by
 * block until the rendered guess matches. Permuting the blocks removes the
 * arrangement too, so a recovered block has nowhere to go.
 *
 * The order is seeded rather than random, and that is not a detail. An editor
 * whose preview does not match the file it exports is broken, and both are
 * rendered from the same document by the same code — so the shuffle has to be a
 * function of the document, not of the moment it was drawn.
 */

/**
 * A seed from a layer's id.
 *
 * FNV-1a: multiply and xor over the bytes. It is a hash for spreading values,
 * not for hiding them — the id it is derived from is in the document anyway.
 */
export function seedFrom(text: string): number {
  const OFFSET = 0x811c9dc5;
  const PRIME = 0x01000193;
  let hash = OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), PRIME);
  }
  // A zero state would leave the generator below stuck on zero forever.
  return (hash >>> 0) || OFFSET;
}

/**
 * The textbook three-shift integer generator: xor with a shifted copy of
 * itself, three times, which walks the whole 32-bit range before repeating.
 * `Math.random` cannot be seeded, and a shuffle that cannot be repeated cannot
 * be drawn twice the same way.
 */
function randomSequence(seed: number): () => number {
  const RANGE = 0x100000000;
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / RANGE;
  };
}

/**
 * Where each cell of a `count`-cell grid comes from, as a permutation.
 *
 * Fisher–Yates from the end, so every arrangement is equally likely and no cell
 * is more likely than another to stay where it was.
 */
export function shuffleOrder(count: number, seed: number): number[] {
  const order = Array.from({ length: Math.max(0, count) }, (_, index) => index);
  const random = randomSequence(seed);

  for (let index = order.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    const held = order[index]!;
    order[index] = order[pick]!;
    order[pick] = held;
  }
  return order;
}
