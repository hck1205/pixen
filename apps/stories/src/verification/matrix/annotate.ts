/**
 * What is drawn on top, how it is styled, and how something is hidden.
 *
 * Three groups that were one file until it crossed the size budget — and its
 * own three `title`s already said where the seams were. The order is the order
 * the page reads them in.
 */
import type { ClaimGroup } from "../claim.js";
import { ANNOTATION_CLAIMS } from "./annotation.js";
import { COLOUR_CLAIMS } from "./colour.js";
import { HIDING_CLAIMS } from "./hiding.js";

export const ANNOTATE_CLAIMS: ClaimGroup[] = [COLOUR_CLAIMS, ANNOTATION_CLAIMS, HIDING_CLAIMS];
