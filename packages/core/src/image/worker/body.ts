/**
 * The worker itself.
 *
 * Written as an ordinary function and serialised with `toString()`, so it is
 * real code the compiler checks rather than a string literal nobody can read —
 * and so it ships inside the bundle instead of as a second file every host
 * would have to serve from the right path.
 *
 * **It must not reference anything outside itself.** Serialisation carries the
 * body and nothing else: a captured constant, an imported helper or a type
 * guard from another module would all be `undefined` inside the worker.
 */
export function imageWorkerBody(): void {
  self.addEventListener("message", (event: MessageEvent) => {
    const request = event.data as
      | { id: number; kind: "decode"; blob: Blob }
      | {
          id: number;
          kind: "encode";
          pixels: ArrayBuffer;
          width: number;
          height: number;
          format: string;
          quality: number;
        };

    const fail = (id: number, cause: unknown): void => {
      const message = cause instanceof Error ? cause.message : String(cause);
      (self as unknown as Worker).postMessage({ id, ok: false, message });
    };

    if (request.kind === "decode") {
      // "none" matches the main-thread path, and for the same reason: whether
      // the browser honours it is measured once by `decoderAppliesOrientation`,
      // and both paths hand the same request to the same engine, so one answer
      // covers them both.
      createImageBitmap(request.blob, { imageOrientation: "none" })
        .then((bitmap) => {
          (self as unknown as Worker).postMessage(
            { id: request.id, ok: true, kind: "decode", bitmap, width: bitmap.width, height: bitmap.height },
            [bitmap],
          );
        })
        .catch((cause: unknown) => fail(request.id, cause));
      return;
    }

    if (request.kind === "encode") {
      try {
        const canvas = new OffscreenCanvas(request.width, request.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2d context in worker");
        context.putImageData(
          new ImageData(new Uint8ClampedArray(request.pixels), request.width, request.height),
          0,
          0,
        );
        canvas
          .convertToBlob({ type: request.format, quality: request.quality })
          .then((blob) => {
            (self as unknown as Worker).postMessage({ id: request.id, ok: true, kind: "encode", blob });
          })
          .catch((cause: unknown) => fail(request.id, cause));
      } catch (cause) {
        fail(request.id, cause);
      }
    }
  });
}
