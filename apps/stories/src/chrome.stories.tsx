import { ANNOTATION_COLOURS, REDACTION_COLOUR } from "@pixen/core";
import { icons } from "@pixen/web";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Design",
} satisfies StoryDefault;

/** The icon set on one page: one weight, one grid, no third-party assets. */
export const Icons: Story<{ size: number }> = ({ size }) => (
  <div style={grid}>
    {Object.entries(icons).map(([name, markup]) => (
      <figure key={name} style={cell}>
        <span
          style={{ width: size, height: size, display: "grid", placeItems: "center" }}
          // The icons are authored in this repository, so the markup is trusted.
          dangerouslySetInnerHTML={{ __html: markup }}
        />
        <figcaption style={caption}>{name}</figcaption>
      </figure>
    ))}
  </div>
);

Icons.args = { size: 28 };
Icons.argTypes = { size: { control: { type: "range", min: 16, max: 64, step: 4 } } };

/** Annotation colours, at the size an annotation actually appears. */
export const Palette: Story = () => (
  <div style={grid}>
    {[...ANNOTATION_COLOURS, REDACTION_COLOUR].map((colour, index) => (
      <figure key={`${colour}-${index}`} style={cell}>
        <span style={{ width: 56, height: 56, borderRadius: 12, background: colour, display: "block" }} />
        <figcaption style={caption}>{colour}</figcaption>
      </figure>
    ))}
  </div>
);

/** The customisation surface: every token, with what it controls. */
export const Tokens: Story = () => (
  <table style={table}>
    <thead>
      <tr>
        <th style={th}>Token</th>
        <th style={th}>Default</th>
        <th style={th}>Controls</th>
      </tr>
    </thead>
    <tbody>
      {TOKENS.map((token) => (
        <tr key={token.name}>
          <td style={td}>
            <code>{token.name}</code>
          </td>
          <td style={td}>
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
          <td style={td}>{token.controls}</td>
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

const grid: React.CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  font: "400 12px/1.4 system-ui, sans-serif",
};

const cell: React.CSSProperties = {
  margin: 0,
  display: "grid",
  gap: 8,
  justifyItems: "center",
  padding: 14,
  borderRadius: 12,
  border: "1px solid rgba(127,140,170,0.25)",
};

const caption: React.CSSProperties = { opacity: 0.7, textAlign: "center", wordBreak: "break-all" };

const table: React.CSSProperties = {
  borderCollapse: "collapse",
  font: "400 13px/1.5 system-ui, sans-serif",
  width: "100%",
  maxWidth: 860,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "1px solid rgba(127,140,170,0.35)",
  opacity: 0.7,
  font: "600 12px/1.4 system-ui, sans-serif",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const td: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid rgba(127,140,170,0.18)" };
