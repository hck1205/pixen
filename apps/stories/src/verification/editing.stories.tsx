/**
 * Verification · Editing.
 *
 * Colour, annotation, redaction and decoration — the three groups that are
 * about what is drawn rather than where it is. The live work for these is in
 * the Editor section, which drives the real interface; this page is the claim
 * and the evidence, and points at those stories by name.
 */
import { COMPARISON_NOTE, ClaimTable } from "./table.js";
import { ANNOTATE_CLAIMS } from "./matrix/index.js";
import { note } from "../styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Verification/Editing",
} satisfies StoryDefault;

export const Matrix: Story = () => (
  <section style={{ display: "grid", gap: 16 }}>
    {/* No heading of its own: the group titles inside the table already say
        which slice this is, and two identical headings read as a mistake. */}
    <header style={{ padding: "4px 2px 0" }}>
      <p style={note}>{COMPARISON_NOTE}</p>
    </header>
    <ClaimTable groups={ANNOTATE_CLAIMS} />
  </section>
);
