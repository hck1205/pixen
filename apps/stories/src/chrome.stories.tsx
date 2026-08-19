import { ANNOTATION_COLOURS, REDACTION_COLOUR } from "@pixen/core";
import { icons } from "@pixen/web";
import type { Story, StoryDefault } from "@ladle/react";
import {
  specimenCaption,
  specimenCell,
  specimenGrid,
  table as tableStyle,
  tableCell,
  tableHeader,
} from "./styles.js";

export default {
  title: "Design",
} satisfies StoryDefault;

/** The icon set on one page: one weight, one grid, no third-party assets. */
export const Icons: Story<{ size: number }> = ({ size }) => (
  <div style={specimenGrid}>
    {Object.entries(icons).map(([name, markup]) => (
      <figure key={name} style={specimenCell}>
        <span
          style={{ width: size, height: size, display: "grid", placeItems: "center" }}
          // The icons are authored in this repository, so the markup is trusted.
          dangerouslySetInnerHTML={{ __html: markup }}
        />
        <figcaption style={specimenCaption}>{name}</figcaption>
      </figure>
    ))}
  </div>
);

Icons.args = { size: 28 };
Icons.argTypes = { size: { control: { type: "range", min: 16, max: 64, step: 4 } } };

/** Annotation colours, at the size an annotation actually appears. */
export const Palette: Story = () => (
  <div style={specimenGrid}>
    {[...ANNOTATION_COLOURS, REDACTION_COLOUR].map((colour, index) => (
      <figure key={`${colour}-${index}`} style={specimenCell}>
        <span style={{ width: 56, height: 56, borderRadius: 12, background: colour, display: "block" }} />
        <figcaption style={specimenCaption}>{colour}</figcaption>
      </figure>
    ))}
  </div>
);

/** The customisation surface: every token, with what it controls. */
export const Tokens: Story = () => (
  <table style={tableStyle}>
    <thead>
      <tr>
        <th style={tableHeader}>Token</th>
        <th style={tableHeader}>Default</th>
        <th style={tableHeader}>Controls</th>
      </tr>
    </thead>
    <tbody>
      {TOKENS.map((token) => (
        <tr key={token.name}>
          <td style={tableCell}>
            <code>{token.name}</code>
          </td>
          <td style={tableCell}>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              {token.value.startsWith("#") || token.value.startsWith("rgba") ? (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: token.value,
                    border: "1px solid rgba(127,140,170,0.4)",
                  }}
                />
              ) : null}
              <code>{token.value}</code>
            </span>
          </td>
          <td style={tableCell}>{token.controls}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const TOKENS = [
  { name: "--pixen-surface-sunken", value: "#0d0e12", controls: "The workspace behind the image" },
  { name: "--pixen-surface-raised", value: "rgba(38, 41, 50, 0.92)", controls: "Floating rail, actions, inspector" },
  { name: "--pixen-text", value: "#f2f4f8", controls: "Control labels and icons" },
  { name: "--pixen-text-muted", value: "#a2a8b8", controls: "Field labels and readouts" },
  { name: "--pixen-accent", value: "#4f8cff", controls: "Active tool, primary action, focus ring" },
  { name: "--pixen-border", value: "rgba(255,255,255,0.10)", controls: "Chrome outlines and dividers" },
  { name: "--pixen-radius", value: "12px", controls: "Chrome corners" },
  { name: "--pixen-control-size", value: "38px", controls: "Button hit area" },
  { name: "--pixen-crop-outline", value: "rgba(255,255,255,0.95)", controls: "Crop frame and corner brackets" },
  { name: "--pixen-crop-scrim", value: "rgba(8,9,12,0.62)", controls: "The dimmed area outside the crop" },
  { name: "--pixen-grid-line", value: "rgba(255,255,255,0.28)", controls: "Rule-of-thirds guides" },
  { name: "--pixen-selection", value: "#4f8cff", controls: "Selected annotation outline" },
];





const td: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid rgba(127,140,170,0.18)" };
