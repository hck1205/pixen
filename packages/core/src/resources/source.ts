import type { SourceDescriptor } from "../model/types.js";
import type { ImageResource } from "./manager.js";

/**
 * A registered bitmap, as the descriptor a document stores.
 *
 * Documents keep an id and the numbers that every crop and annotation is
 * measured against; the bitmap itself stays in the resource manager. Three
 * places were spelling that conversion out — opening, replacing the pixels
 * under an edit, and editor-free processing — which is three chances for one of
 * them to forget to carry the name or the type across.
 */
export function sourceFromResource(resource: ImageResource): SourceDescriptor {
  return {
    resourceId: resource.id,
    width: resource.width,
    height: resource.height,
    ...(resource.name ? { name: resource.name } : {}),
    ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
  };
}
