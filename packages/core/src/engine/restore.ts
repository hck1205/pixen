import { PixenError } from "../errors/index.js";
import { deserializeDocument } from "../model/serialize.js";
import type { EditorDocument } from "../model/types.js";
import type { ImageResource } from "../resources/manager.js";

/**
 * Restoring a saved document: what it needs before it can be opened.
 *
 * A document stores a `resourceId` and no pixels, and ids do not survive a page
 * reload. So a restore is one of two things — the bitmap is still registered and
 * the document opens as it is, or it is not and the caller has to supply the
 * bytes. Which of the two, and what the document looks like once it has been
 * pointed at new bytes, is arithmetic over data; the decode around it is not.
 */
export type RestorePlan =
  | { kind: "ready"; document: EditorDocument; resourceId: string }
  | { kind: "needs-image"; document: EditorDocument; resourceId: string };

export function planRestore(input: unknown, isRegistered: (id: string) => boolean): RestorePlan {
  const document = deserializeDocument(input);
  const { resourceId } = document.source;
  return { kind: isRegistered(resourceId) ? "ready" : "needs-image", document, resourceId };
}

/** The error a restore owes a caller that did not bring the bytes it needs. */
export function missingResource(resourceId: string): PixenError {
  return new PixenError(
    "RESOURCE_MISSING",
    `The document references resource "${resourceId}", which is not registered. Pass the image bytes as the second argument.`,
    { details: { resourceId } },
  );
}

/**
 * The same edit, pointed at a freshly decoded bitmap.
 *
 * The size travels with the id: a document restored against a different scan of
 * the same picture would otherwise keep the old dimensions, and every crop and
 * annotation in it would land somewhere else.
 */
export function repointSource(document: EditorDocument, resource: ImageResource): EditorDocument {
  return {
    ...document,
    source: {
      ...document.source,
      resourceId: resource.id,
      width: resource.width,
      height: resource.height,
    },
  };
}
