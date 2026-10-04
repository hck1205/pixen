/**
 * Verification · Editing.
 *
 * Colour, annotation, redaction and decoration — the three groups that are
 * about what is drawn rather than where it is. The live work for these is in
 * the Editor section, which drives the real interface; this page is the claim
 * and the evidence, and points at those stories by name.
 */
import { matrixStory } from "./table.js";
import { ANNOTATE_CLAIMS } from "./matrix/index.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Verification/Editing",
} satisfies StoryDefault;

export const Matrix: Story = matrixStory(ANNOTATE_CLAIMS);
