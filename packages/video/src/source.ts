/**
 * Getting a moving picture into the editor.
 *
 * There is nothing to decode. An `HTMLVideoElement` is already a
 * `CanvasImageSource` — the platform will `drawImage` whatever frame is showing
 * — so the whole of loading a video is: make one, wait until it knows its own
 * size, and hand it to the `ResourceManager` as the source.
 *
 * That one fact is what makes this package small. The crop, the rotation, the
 * adjustments, the annotations and the export pipeline are the ones that were
 * already there, and every one of them reaches every frame without being told
 * that the picture moves.
 */
import { PixenError, type Editor, type ImageResource, type ResourceManager } from "@pixen/core";

/** How long to wait for a browser to tell us what it just opened. */
const METADATA_TIMEOUT_MS = 30_000;

export interface VideoSourceOptions {
  /** Abandons the load. The element is torn down either way. */
  signal?: AbortSignal;
  /** Sent as the element's `crossorigin`, for a source on another host. */
  crossOrigin?: "anonymous" | "use-credentials";
  /** Overrides the name used for an exported filename. */
  name?: string;
}

export interface VideoSource {
  /** Also the resource's drawable source, and what the timeline scrubs. */
  readonly element: HTMLVideoElement;
  readonly resource: ImageResource;
  readonly duration: number;
}

/**
 * Opens a video and registers it as the editor's source.
 *
 * Not exported: `openVideo` is the whole of what a host needs, and a resource
 * with no document to put it in is an API nobody has asked for yet.
 *
 * The element is muted and `playsInline` before it is given a source, which is
 * not a preference: a browser refuses `play()` on an unmuted video that no one
 * has clicked on, and on a phone an un-inlined one takes over the whole screen.
 * Recording calls `play()` without a gesture, so both have to be true from the
 * start.
 */
async function loadVideo(
  input: Blob | string,
  resources: ResourceManager,
  options: VideoSourceOptions = {},
): Promise<VideoSource> {
  const element = document.createElement("video");
  element.muted = true;
  element.playsInline = true;
  element.preload = "auto";
  if (options.crossOrigin) element.crossOrigin = options.crossOrigin;

  const url = typeof input === "string" ? input : URL.createObjectURL(input);
  const revoke = () => {
    if (typeof input !== "string") URL.revokeObjectURL(url);
  };

  try {
    element.src = url;
    await untilReady(element, options.signal);
  } catch (cause) {
    revoke();
    element.removeAttribute("src");
    element.load();
    throw cause;
  }

  const name = options.name ?? (typeof input === "string" ? filenameFromUrl(input) : nameOfBlob(input));
  const resource = resources.adopt({
    source: element,
    width: element.videoWidth,
    height: element.videoHeight,
    duration: element.duration,
    mimeType: typeof input === "string" ? "" : input.type,
    ...(name ? { name } : {}),
  });

  // The object URL outlives this call: the element reads from it for as long as
  // the resource is alive, and revoking it here would empty the picture.
  return { element, resource, duration: element.duration };
}

/**
 * Waits until the element knows its size and how long it runs.
 *
 * `loadedmetadata` is the event that means both. A duration that is not a
 * finite number is a stream rather than a file — live, or one the server
 * described badly — and there is no clip to take out of something with no end.
 */
function untilReady(element: HTMLVideoElement, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (settle: () => void) => {
      element.removeEventListener("loadedmetadata", onMetadata);
      element.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      clearTimeout(timer);
      settle();
    };
    const onMetadata = () =>
      done(() => {
        if (!Number.isFinite(element.duration) || element.duration <= 0) {
          reject(
            new PixenError("UNSUPPORTED_FORMAT", "This source has no duration, so there is nothing to trim", {
              details: { duration: element.duration },
            }),
          );
          return;
        }
        resolve();
      });
    const onError = () =>
      done(() =>
        reject(
          new PixenError("DECODE_FAILED", "The video could not be opened", {
            details: { code: element.error?.code ?? null },
          }),
        ),
      );
    const onAbort = () => done(() => reject(new PixenError("ABORTED", "Loading the video was aborted")));
    const timer = setTimeout(
      () => done(() => reject(new PixenError("DECODE_FAILED", "The video did not report its metadata"))),
      METADATA_TIMEOUT_MS,
    );

    if (signal?.aborted) {
      onAbort();
      return;
    }
    element.addEventListener("loadedmetadata", onMetadata);
    element.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort);
  });
}

/**
 * Opens a video and starts a document on it, which is `editor.load` for a source
 * the engine cannot decode for itself — `open` was already the seam for a host
 * that decodes its own pictures, and a video is one of those.
 *
 * Returns the element as well as the document, because everything that makes a
 * video a video — where it is up to, whether it is playing — is on the element,
 * and the engine deliberately does not learn about any of it.
 */
export async function openVideo(
  editor: Editor,
  input: Blob | string,
  options: VideoSourceOptions = {},
): Promise<VideoSource> {
  const opened = await loadVideo(input, editor.resources, options);
  editor.open(opened.resource);
  return opened;
}

function nameOfBlob(blob: Blob): string | undefined {
  return blob instanceof File ? blob.name : undefined;
}

function filenameFromUrl(url: string): string | undefined {
  const path = url.split(/[?#]/, 1)[0] ?? "";
  const last = path.slice(path.lastIndexOf("/") + 1);
  return last || undefined;
}
