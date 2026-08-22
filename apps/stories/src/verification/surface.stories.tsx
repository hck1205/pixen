/**
 * Verification · Surface.
 *
 * The contract a host integrates against. The probe reads it out of the shipped
 * package rather than restating it: attributes, events, parts and slots come
 * from the element itself, so a name that changes changes here too.
 */
import { createElement, useEffect, useRef, useState } from "react";
import { matrixStory } from "./table.js";
import { SURFACE_CLAIMS } from "./matrix/index.js";
import { note, panelTitle, specimenCaption, specimenCell, specimenGrid } from "../styles.js";
import { OBSERVED_ATTRIBUTES, PIXEN_EVENTS } from "@pixen/web";
import type { Story, StoryDefault } from "@ladle/react";
import "@pixen/web";

export default {
  title: "Verification/Surface",
} satisfies StoryDefault;

export const Matrix: Story = matrixStory(SURFACE_CLAIMS);

function Names({ title, values }: { title: string; values: readonly string[] }) {
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <h3 style={panelTitle}>
        {title} — {values.length}
      </h3>
      <div style={specimenGrid}>
        {values.map((value) => (
          <p key={value} style={specimenCell}>
            <code style={specimenCaption}>{value}</code>
          </p>
        ))}
      </div>
    </section>
  );
}

export const Contract: Story = () => {
  const host = useRef<HTMLElement | null>(null);
  const [contract, setContract] = useState<{ parts: string[]; slots: string[] } | null>(null);

  useEffect(() => {
    const root = host.current?.shadowRoot;
    if (!root) return;
    const parts = new Set<string>();
    for (const node of root.querySelectorAll<HTMLElement>("[part]")) {
      for (const name of node.getAttribute("part")?.split(/\s+/) ?? []) if (name) parts.add(name);
    }
    setContract({
      parts: [...parts].sort(),
      slots: [...root.querySelectorAll("slot")].map((slot) => slot.name).filter(Boolean).sort(),
    });
  }, []);

  return (
    <section style={{ display: "grid", gap: 24, padding: "4px 2px 40px" }}>
      <header style={{ display: "grid", gap: 6 }}>
        <h2 style={panelTitle}>The integration contract, read off the element</h2>
        <p style={note}>
          Nothing on this page is typed out. The attributes and events come from the package's own exported
          lists, and the parts and slots are read out of a real shadow root mounted below — so a name that
          changes changes here.
        </p>
      </header>

      {/* Mounted with no image: the contract is about the element, not a picture. */}
      <div style={{ height: 1, overflow: "hidden", opacity: 0 }}>
        {createElement("pixen-image-editor", { ref: host })}
      </div>

      <Names title="Attributes" values={OBSERVED_ATTRIBUTES} />
      <Names title="Events" values={PIXEN_EVENTS.map((name) => `pixen-${name}`)} />
      <Names title="Parts" values={contract?.parts ?? []} />
      <Names title="Slots" values={contract?.slots ?? []} />
    </section>
  );
};
