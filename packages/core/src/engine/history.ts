import { PixenError } from "../errors/index.js";
import { cloneDocument } from "../model/document.js";
import type { EditorDocument } from "../model/types.js";

export interface HistoryEntry {
  label: string;
  before: EditorDocument;
  after: EditorDocument;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  depth: number;
  inTransaction: boolean;
}

export interface HistoryOptions {
  /** Entries kept before the oldest is dropped. */
  limit?: number;
}

/**
 * Snapshot history with explicit transactions.
 *
 * A pointer drag produces a continuous stream of document states; the editor
 * opens a transaction on pointerdown and commits on pointerup, so the whole
 * gesture undoes as one step. Snapshots — rather than inverse commands — are
 * viable here precisely because documents hold no pixels: a snapshot is a small
 * JSON object, while the bitmaps stay in the ResourceManager.
 */
export class History {
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  #limit: number;
  #transaction: { label: string; before: EditorDocument } | null = null;

  constructor(options: HistoryOptions = {}) {
    this.#limit = Math.max(1, options.limit ?? 100);
  }

  get inTransaction(): boolean {
    return this.#transaction !== null;
  }

  get transactionLabel(): string | null {
    return this.#transaction?.label ?? null;
  }

  state(): HistoryState {
    return {
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      undoLabel: this.#undo.at(-1)?.label ?? null,
      redoLabel: this.#redo.at(-1)?.label ?? null,
      depth: this.#undo.length,
      inTransaction: this.inTransaction,
    };
  }

  /** Records an already-applied atomic change. */
  push(label: string, before: EditorDocument, after: EditorDocument): void {
    if (this.#transaction) return; // the open transaction will record the whole gesture
    this.#undo.push({ label, before: cloneDocument(before), after: cloneDocument(after) });
    if (this.#undo.length > this.#limit) this.#undo.shift();
    this.#redo.length = 0;
  }

  begin(label: string, document: EditorDocument): void {
    if (this.#transaction) {
      throw new PixenError(
        "INVALID_STATE",
        `A transaction ("${this.#transaction.label}") is already open`,
        { details: { openLabel: this.#transaction.label, requestedLabel: label } },
      );
    }
    this.#transaction = { label, before: cloneDocument(document) };
  }

  /**
   * Closes the open transaction. A gesture that ended where it started records
   * nothing, so a click that does not move never costs an undo step.
   */
  commit(document: EditorDocument): boolean {
    const transaction = this.#transaction;
    if (!transaction) {
      throw new PixenError("INVALID_STATE", "commit() was called without an open transaction");
    }
    this.#transaction = null;

    if (documentsEqual(transaction.before, document)) return false;

    this.#undo.push({ label: transaction.label, before: transaction.before, after: cloneDocument(document) });
    if (this.#undo.length > this.#limit) this.#undo.shift();
    this.#redo.length = 0;
    return true;
  }

  /** Abandons the open transaction and returns the state to restore. */
  rollback(): EditorDocument {
    const transaction = this.#transaction;
    if (!transaction) {
      throw new PixenError("INVALID_STATE", "rollback() was called without an open transaction");
    }
    this.#transaction = null;
    return transaction.before;
  }

  undo(): EditorDocument | null {
    if (this.#transaction) {
      throw new PixenError("INVALID_STATE", "Cannot undo while a transaction is open");
    }
    const entry = this.#undo.pop();
    if (!entry) return null;
    this.#redo.push(entry);
    return cloneDocument(entry.before);
  }

  redo(): EditorDocument | null {
    if (this.#transaction) {
      throw new PixenError("INVALID_STATE", "Cannot redo while a transaction is open");
    }
    const entry = this.#redo.pop();
    if (!entry) return null;
    this.#undo.push(entry);
    return cloneDocument(entry.after);
  }

  clear(): void {
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#transaction = null;
  }
}

/** Documents are plain JSON by contract, so this comparison is exact. */
export function documentsEqual(a: EditorDocument, b: EditorDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
