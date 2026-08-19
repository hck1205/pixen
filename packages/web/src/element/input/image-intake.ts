import { carriesFiles, imageFromClipboard, imageFromFiles } from "./transfer.js";

/**
 * Every way an image arrives from the platform.
 *
 * Dropping, pasting and picking a file are one concern wearing three event
 * names: something outside the page hands over a file, and the editor opens it.
 * They were five listeners on the element, each individually trivial and
 * collectively the reason the element also owned the drop overlay's visibility.
 *
 * `attach` returns the function that unwires everything, so the element's
 * teardown stays one line.
 */
export interface ImageIntakePorts {
  /** The element itself: the drop target, and the thing `relatedTarget` is inside. */
  readonly host: HTMLElement;
  /** Shown while a file is over the host. */
  readonly dropHost: HTMLElement;
  /** The hidden `<input type="file">` behind the empty state's button. */
  readonly fileInput: HTMLInputElement;
  open(file: File): void;
}

export class ImageIntake {
  #ports: ImageIntakePorts;

  constructor(ports: ImageIntakePorts) {
    this.#ports = ports;
  }

  attach(): () => void {
    const { host, fileInput } = this.#ports;
    host.addEventListener("dragover", this.#onDragOver);
    host.addEventListener("dragleave", this.#onDragLeave);
    host.addEventListener("drop", this.#onDrop);
    host.addEventListener("paste", this.#onPaste);
    fileInput.addEventListener("change", this.#onFilePicked);

    return () => {
      host.removeEventListener("dragover", this.#onDragOver);
      host.removeEventListener("dragleave", this.#onDragLeave);
      host.removeEventListener("drop", this.#onDrop);
      host.removeEventListener("paste", this.#onPaste);
      fileInput.removeEventListener("change", this.#onFilePicked);
    };
  }

  /** Opens the file picker the empty state's button stands in for. */
  choose(): void {
    this.#ports.fileInput.click();
  }

  #onDragOver = (event: DragEvent): void => {
    // Only a drag carrying files is ours; a dragged selection is the page's.
    if (!carriesFiles(event.dataTransfer?.types)) return;
    event.preventDefault();
    this.#ports.dropHost.hidden = false;
  };

  #onDragLeave = (event: DragEvent): void => {
    // Moving between the host's own children is not leaving the host.
    if (event.relatedTarget && this.#ports.host.contains(event.relatedTarget as Node)) return;
    this.#ports.dropHost.hidden = true;
  };

  #onDrop = (event: DragEvent): void => {
    this.#ports.dropHost.hidden = true;
    const file = imageFromFiles(event.dataTransfer?.files);
    if (!file) return;
    event.preventDefault();
    this.#ports.open(file);
  };

  #onPaste = (event: ClipboardEvent): void => {
    const file = imageFromClipboard(event.clipboardData?.items);
    if (!file) return;
    event.preventDefault();
    this.#ports.open(file);
  };

  #onFilePicked = (): void => {
    const file = imageFromFiles(this.#ports.fileInput.files);
    if (file) this.#ports.open(file);
    // Cleared so picking the same file twice fires `change` the second time.
    this.#ports.fileInput.value = "";
  };
}
