/**
 * How the editor looks and reads: themes, tokens, slots, languages, and the
 * sizes it has to survive.
 */
import { useState } from "react";
import { PixenImageEditor } from "@pixen/react";
import { availableLocales } from "@pixen/web";
import { ElementEditor, Row, Stage, useSampleImage } from "./harness.js";
import { hostButton, hostPrimaryButton } from "./styles.js";
import type { Story, StoryDefault } from "@ladle/react";

/** Every locale the package registers, for the locale story's knob. */
const LOCALE_OPTIONS = availableLocales();

/**
 * One title across every story file, so the ids stay `editor--<story>` however
 * the files are arranged.
 */
export default {
  title: "Editor",
} satisfies StoryDefault;

/**
 * Every locale Pixen ships, including one that reads right to left.
 *
 * The chrome is laid out in logical properties, so mirroring is `dir` and
 * nothing else — which is exactly what this story is here to prove.
 */
export const Locales: Story<{ locale: string }> = ({ locale }) => {
  const image = useSampleImage();
  return (
    <Row>
      <Stage height={420} title={locale} note="Chosen with the knob.">
        <PixenImageEditor key={locale} src={image} locale={locale} style={{ height: "100%" }} />
      </Stage>
      <Stage height={420} title="ar" note="Right to left: the rail and the chrome mirror.">
        <PixenImageEditor src={image} locale="ar" style={{ height: "100%" }} />
      </Stage>
    </Row>
  );
};

Locales.args = { locale: "ja" };
Locales.argTypes = { locale: { options: LOCALE_OPTIONS, control: { type: "select" } } };

/** Both themes together: the fastest way to catch a hard-coded colour. */
export const Themes: Story = () => {
  const image = useSampleImage();
  return (
    <Row>
      <Stage height={420} title="Dark" note="The default.">
        <PixenImageEditor src={image} theme="dark" style={{ height: "100%" }} />
      </Stage>
      <Stage height={420} title="Light" note="Same markup, `theme=&quot;light&quot;`.">
        <PixenImageEditor src={image} theme="light" style={{ height: "100%" }} />
      </Stage>
    </Row>
  );
};

/** Level 1 customisation: CSS custom properties. */
export const Theming: Story = () => {
  const image = useSampleImage();
  return (
    <Stage
      title="CSS variables"
      note="Colour, radius and control size are tokens; no part of the UI needs overriding for a brand fit."
    >
      <PixenImageEditor
        src={image}
        style={
          {
            height: "100%",
            "--pixen-accent": "#12a594",
            "--pixen-surface-raised": "rgba(12, 32, 30, 0.92)",
            "--pixen-surface-sunken": "#04120f",
            "--pixen-radius": "18px",
            "--pixen-radius-small": "12px",
            "--pixen-control-size": "42px",
            "--pixen-crop-outline": "#7ce3d3",
          } as React.CSSProperties
        }
      />
    </Stage>
  );
};

/** Level 3 customisation: replacing chrome through slots. */
export const Slots: Story = () => {
  const image = useSampleImage();
  return (
    <Stage
      title="Slotted actions"
      note="The host replaces the action cluster entirely; the editor stays in charge of state."
    >
      <ElementEditor image={image}>
        <div
          slot="actions"
          style={{
            display: "flex",
            gap: 8,
            padding: 6,
            borderRadius: 12,
            background: "#101319",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <button
            type="button"
            style={hostButton}
            onClick={(event) => event.currentTarget.closest("pixen-image-editor")?.undo()}
          >
            Undo
          </button>
          <button
            type="button"
            style={hostPrimaryButton}
            onClick={(event) => void event.currentTarget.closest("pixen-image-editor")?.export()}
          >
            Save photo
          </button>
        </div>
      </ElementEditor>
    </Stage>
  );
};

/** Small containers and phone widths, where the chrome has to rearrange. */
export const Compact: Story = () => {
  const image = useSampleImage();
  return (
    <Row>
      <Stage height={320} title="Short container" note="360 × 320. The rail and inspector must not overlap the image.">
        <div style={{ width: 360, height: "100%" }}>
          <PixenImageEditor src={image} style={{ height: "100%" }} />
        </div>
      </Stage>
      <Stage height={560} title="Phone width" note="390px: the rail lies down and the inspector spans the width.">
        <div style={{ width: 390, height: "100%" }}>
          <PixenImageEditor src={image} style={{ height: "100%" }} />
        </div>
      </Stage>
    </Row>
  );
};

/** Two editors sharing a page, which is where global state leaks would show. */
export const TwoEditors: Story = () => {
  const image = useSampleImage();
  const [count, setCount] = useState(2);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <button type="button" style={hostButton} onClick={() => setCount((value) => (value === 2 ? 1 : 2))}>
        Toggle to {count === 2 ? "one" : "two"} editors
      </button>
      <Row columns={count}>
        {Array.from({ length: count }, (_, index) => (
          <Stage key={index} height={380} title={`Editor ${index + 1}`}>
            <PixenImageEditor src={image} style={{ height: "100%" }} />
          </Stage>
        ))}
      </Row>
    </div>
  );
};
