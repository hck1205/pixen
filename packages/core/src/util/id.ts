let counter = 0;

/** Short, collision-resistant enough for ids that only need to be unique per document. */
export function createId(prefix: string): string {
  counter = (counter + 1) % 0xffff;
  const random = Math.floor(Math.random() * 0xffffff).toString(36);
  const seq = counter.toString(36).padStart(3, "0");
  return `${prefix}_${seq}${random}`;
}
