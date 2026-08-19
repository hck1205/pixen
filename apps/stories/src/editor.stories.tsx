import { useEffect, useRef, useState } from "react";
import {
  ADJUSTMENT_KEYS,
  ADJUSTMENT_PRESETS,
  ADJUSTMENT_RANGES,
  FRAME_STYLES,
  presetAdjustments,
  REDACTION_MODES,
  type RedactionMode,
  type WatermarkPosition,
} from "@pixen/core";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import type { Story, StoryDefault } from "@ladle/react";
import {
  createStickers,
  createTransparentSample,
  seedAnnotations,
  seedRedaction,
  seedWatermark,
} from "./fixtures.js";
import { ElementEditor, Row, SeededEditor, Stage, useBlob, useSampleImage } from "./harness.js";
import { hostButton, hostPrimaryButton } from "./styles.js";

/** What each redaction mode actually promises, in the words the docs use. */
const REDACTION_MODE_NOTES: Record<RedactionMode, string> = {
  solid: "Replaces the pixels. The only mode to use for an identifier.",
  blur: "Obscures the pixels. Irreversible in the export, but not erasure.",
  pixelate: "Averages blocks of pixels. Same caveat as blur.",
};

/** Every placement the watermark helper accepts, in reading order. */
const WATERMARK_POSITIONS: WatermarkPosition[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "centre",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
  "tile",
];

export default {
  title: "Editor",
} satisfies StoryDefault;

/**
 * The story to open first: every control the element exposes, wired to Ladle's
 * knobs, so a change can be seen in one place before anything else is checked.
 */
export const Playground: Story<{
  theme: "dark" | "light";
  locale: "en" | "ko";
  preset: "" | "profile" | "marketplace" | "banner";
  format: "" | "image/webp" | "image/jpeg" | "image/png";
  quality: number;
  height: number;
}> = ({ theme, locale, preset, format, quality, height }) => {
  const image = useSampleImage();
  return (
    <Stage height={height} title="Playground" note="Every attribute the element accepts, on one editor.">
      <PixenImageEditor
        src={image}
        theme={theme}
        locale={locale}
        policy={preset || null}
        {...(format ? { format } : {})}
        quality={quality}
        style={{ height: "100%" }}
      />
    </Stage>
  );
};

Playground.args = {
  theme: "dark",
  locale: "en",
  preset: "",
  format: "",
  quality: 0.82,
  height: 560,
};

Playground.argTypes = {
  theme: { options: ["dark", "light"], control: { type: "radio" } },
  locale: { options: ["en", "ko"], control: { type: "radio" } },
  preset: { options: ["", "profile", "marketplace", "banner"], control: { type: "select" } },
  format: { options: ["", "image/webp", "image/jpeg", "image/png"], control: { type: "select" } },
  quality: { control: { type: "range", min: 0.3, max: 1, step: 0.01 } },
  height: { control: { type: "range", min: 280, max: 900, step: 20 } },
};

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

/** Each tool selected in turn, to review its inspector without clicking through. */
export const Tools: Story<{ tool: "crop" | "select" | "rect" | "ellipse" | "arrow" | "draw" | "text" | "redact" }> = ({
  tool,
}) => {
  const image = useSampleImage();
  const editor = useRef<PixenImageEditorHandle>(null);

  return (
    <Stage
      title={`Tool: ${tool}`}
      note="The inspector along the bottom is contextual — it shows only what the active tool needs."
    >
      <PixenImageEditor
        ref={editor}
        src={image}
        onLoad={() => editor.current?.setTool(tool)}
        style={{ height: "100%" }}
      />
    </Stage>
  );
};

Tools.args = { tool: "crop" };
Tools.argTypes = {
  tool: {
    options: ["crop", "select", "rect", "ellipse", "arrow", "draw", "text", "redact"],
    control: { type: "select" },
  },
};

/** Nothing loaded: the drop target, the copy, and the file button. */
export const EmptyState: Story = () => (
  <Stage title="Empty" note="Shown until an image is loaded. Drop a file, paste one, or use the button.">
    <PixenImageEditor style={{ height: "100%" }} />
  </Stage>
);

/** One layer of every kind, so annotation rendering can be reviewed at a glance. */
export const Annotations: Story = () => {
  const image = useSampleImage();
  const editor = useRef<PixenImageEditorHandle>(null);

  return (
    <Stage
      title="Annotations"
      note="Rectangle, ellipse, arrow, free draw and text — each drawn in image space, so they follow rotation and flips."
    >
      <PixenImageEditor
        ref={editor}
        src={image}
        onLoad={() => {
          const instance = editor.current?.editor;
          if (instance) seedAnnotations(instance);
        }}
        style={{ height: "100%" }}
      />
    </Stage>
  );
};

/** Redaction covers the identifier printed on the sample. */
export const Redaction: Story<{ mode: RedactionMode }> = ({ mode }) => {
  const image = useSampleImage();
  const editor = useRef<PixenImageEditorHandle>(null);

  return (
    <Stage
      title={`Redaction: ${mode}`}
      note="The mask is part of the document, so the export rasterises over the pixels rather than hiding them."
    >
      <PixenImageEditor
        // Remounting on the knob keeps one seeded layer per mode, not three.
        key={mode}
        ref={editor}
        src={image}
        onLoad={() => {
          const instance = editor.current?.editor;
          if (instance) {
            seedRedaction(instance, mode);
            editor.current?.setTool("redact");
          }
        }}
        style={{ height: "100%" }}
      />
    </Stage>
  );
};

Redaction.args = { mode: "solid" };
Redaction.argTypes = { mode: { options: REDACTION_MODES, control: { type: "radio" } } };

/**
 * The three modes on one page. Blur and pixelate are irreversible in the export
 * but are not cryptographic erasure — solid is the one to use for identifiers.
 */
export const RedactionModes: Story = () => {
  const image = useSampleImage();
  return (
    <Row columns={3}>
      {REDACTION_MODES.map((mode) => (
        <Stage key={mode} height={360} title={mode} note={REDACTION_MODE_NOTES[mode]}>
          <SeededEditor image={image} seed={(instance) => seedRedaction(instance, mode)} />
        </Stage>
      ))}
    </Row>
  );
};

/**
 * The select tool's handles: eight to resize, one to rotate.
 *
 * Shift locks the layer's own ratio while resizing, and snaps rotation to 15°.
 */
export const LayerHandles: Story<{ rotation: number }> = ({ rotation }) => {
  const image = useSampleImage();
  return (
    <Stage
      title="Layer handles"
      note="Click the sticker to select it, then drag a corner to resize or the grip above it to rotate."
    >
      <SeededEditor
        key={rotation}
        image={image}
        tool="select"
        seed={(instance) => void seedWatermark(instance, { position: "centre", scale: 0.4, opacity: 1 }).then(() => {
          const layer = instance.document.layers.at(-1);
          if (layer) {
            if (rotation) instance.updateLayer(layer.id, { rotation: (rotation * Math.PI) / 180 });
            instance.select(layer.id);
          }
        })}
      />
    </Stage>
  );
};

LayerHandles.args = { rotation: 0 };
LayerHandles.argTypes = { rotation: { control: { type: "range", min: -180, max: 180, step: 5 } } };

/** A watermark is an image layer, so it undoes, serialises and exports as one. */
export const Watermark: Story<{ position: WatermarkPosition; scale: number; opacity: number }> = ({
  position,
  scale,
  opacity,
}) => {
  const image = useSampleImage();
  return (
    <Stage
      title={`Watermark: ${position}`}
      note="Placement is a fraction of the longest edge, so the same options suit any source size."
    >
      <SeededEditor
        key={`${position}:${scale}:${opacity}`}
        image={image}
        seed={(instance) => void seedWatermark(instance, { position, scale, opacity })}
      />
    </Stage>
  );
};

Watermark.args = { position: "bottom-right", scale: 0.18, opacity: 0.6 };
Watermark.argTypes = {
  position: { options: WATERMARK_POSITIONS, control: { type: "select" } },
  scale: { control: { type: "range", min: 0.05, max: 0.6, step: 0.01 } },
  opacity: { control: { type: "range", min: 0.1, max: 1, step: 0.05 } },
};

/**
 * The sticker tool, with a host-supplied set.
 *
 * Pixen ships no artwork of its own; these three are drawn by the story. Click
 * one and it lands in the middle of the crop, selected, so its handles are
 * already on it.
 */
export const Stickers: Story = () => {
  const image = useSampleImage();
  const [stickers, setStickers] = useState<Array<{ id: string; src: Blob; label: string }> | null>(null);
  const editor = useRef<PixenImageEditorHandle>(null);

  useEffect(() => {
    void createStickers().then(setStickers);
  }, []);

  return (
    <Stage title="Stickers" note="`stickers` is a host property — a URL, a blob, or an object with a label.">
      <PixenImageEditor
        ref={editor}
        src={image}
        {...(stickers ? { stickers } : {})}
        onLoad={() => editor.current?.setTool("sticker")}
        style={{ height: "100%" }}
      />
    </Stage>
  );
};

/** Straightening: a small free rotation that never leaves a blank corner. */
export const Straighten: Story<{ degrees: number }> = ({ degrees }) => {
  const image = useSampleImage();
  return (
    <Stage
      title={`Straighten: ${degrees}°`}
      note="The crop pulls in to stay all image, and keeps its share of the frame — so sliding back to 0 returns what you started with."
    >
      <SeededEditor
        key={degrees}
        image={image}
        tool="crop"
        seed={(instance) => instance.straighten((degrees * Math.PI) / 180)}
      />
    </Stage>
  );
};

Straighten.args = { degrees: 8 };
Straighten.argTypes = { degrees: { control: { type: "range", min: -45, max: 45, step: 1 } } };

/** The three frame styles, and the text watermark, on the same picture. */
export const Decoration: Story = () => {
  const image = useSampleImage();
  return (
    <Row columns={2}>
      {FRAME_STYLES.map((style) => (
        <Stage key={style} height={320} title={`Frame: ${style}`}>
          <SeededEditor image={image} seed={(instance) => instance.setFrame({ style, colour: "#f6f7fb" })} />
        </Stage>
      ))}
      <Stage height={320} title="Text watermark" note="A credit line placed by the same arithmetic as a logo.">
        <SeededEditor
          image={image}
          seed={(instance) =>
            instance.addTextWatermark({ text: "© pixen sample", position: "bottom-right", opacity: 0.75 })
          }
        />
      </Stage>
    </Row>
  );
};

/** Colour adjustment, driven from the story so the sliders can be compared. */
export const Adjustments: Story<{
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  grayscale: number;
  sepia: number;
  invert: number;
  vignette: number;
}> = (values) => {
  const image = useSampleImage();
  const editor = useRef<PixenImageEditorHandle>(null);

  const apply = () => editor.current?.editor?.setAdjustments(values);

  return (
    <Stage
      title="Adjustments"
      note="Applied through the same command the inspector uses; the preview and the export share one code path."
    >
      <PixenImageEditor ref={editor} src={image} onLoad={apply} style={{ height: "100%" }} />
      <button type="button" onClick={apply} style={{ marginTop: 8 }}>
        Apply
      </button>
    </Stage>
  );
};

Adjustments.args = {
  exposure: 0,
  brightness: 0.15,
  contrast: 0.25,
  saturation: -0.4,
  hue: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  vignette: 0,
};

Adjustments.argTypes = Object.fromEntries(
  ADJUSTMENT_KEYS.map((key) => [
    key,
    { control: { type: "range", ...ADJUSTMENT_RANGES[key] } },
  ]),
);

/**
 * Every preset on one page.
 *
 * A preset writes ordinary adjustment values, so what this really shows is nine
 * documents that differ only in numbers — and any of them can be nudged after.
 */
export const Presets: Story = () => {
  const image = useSampleImage();
  return (
    <Row columns={3}>
      {ADJUSTMENT_PRESETS.map((preset) => (
        <Stage key={preset.id} height={300} title={preset.label}>
          <SeededEditor
            image={image}
            seed={(instance) => instance.setAdjustments(presetAdjustments(preset))}
          />
        </Stage>
      ))}
    </Row>
  );
};

/** Aspect ratio sets, including a host-supplied list with custom labels. */
export const AspectRatios: Story = () => {
  const image = useSampleImage();
  return (
    <Row>
      <Stage height={420} title="Default set" note="Free, 1:1, 4:3, 3:2, 16:9.">
        <PixenImageEditor src={image} style={{ height: "100%" }} />
      </Stage>
      <Stage height={420} title="Host set" note="Passed as a property, with the host's own labels.">
        <PixenImageEditor
          src={image}
          aspectRatios={[
            { label: "Story", value: 9 / 16 },
            { label: "Post", value: 1 },
            { label: "Cover", value: 3 },
          ]}
          style={{ height: "100%" }}
        />
      </Stage>
    </Row>
  );
};

/** A trimmed tool set — hosts rarely want all eight. */
export const LimitedTools: Story = () => {
  const image = useSampleImage();
  return (
    <Stage title="Crop and redact only" note="`tools` accepts ids or objects with options.">
      <PixenImageEditor
        src={image}
        tools={[{ type: "crop", options: { ratios: [1, 4 / 3] } }, "redact"]}
        style={{ height: "100%" }}
      />
    </Stage>
  );
};

/** The three shipped policies, side by side. */
export const Policies: Story = () => {
  const image = useSampleImage();
  return (
    <Row columns={3}>
      <Stage height={360} title="profile" note="1:1, 1024px, WebP, ≤500 KB.">
        <PixenImageEditor src={image} policy="profile" style={{ height: "100%" }} />
      </Stage>
      <Stage height={360} title="marketplace" note="4:3, ≤1600px, WebP, ≤1 MB.">
        <PixenImageEditor src={image} policy="marketplace" style={{ height: "100%" }} />
      </Stage>
      <Stage height={360} title="banner" note="16:9, ≤2400px, JPEG on white.">
        <PixenImageEditor src={image} policy="banner" style={{ height: "100%" }} />
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


/** A transparent PNG: alpha in the viewport, and what JPEG export does with it. */
export const Transparency: Story = () => {
  const image = useBlob(() => createTransparentSample(), []);
  return (
    <Stage
      title="Transparent source"
      note="PNG keeps the alpha. Exporting to JPEG paints the configured background instead, since JPEG has no alpha."
    >
      <PixenImageEditor src={image} style={{ height: "100%" }} />
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

/** A portrait source, to check the stage fits rather than fills. */
export const PortraitSource: Story = () => {
  const image = useSampleImage({ width: 900, height: 1400 });
  return (
    <Stage title="Portrait" note="The stage is fitted with padding, so the crop chrome never touches the frame.">
      <PixenImageEditor src={image} style={{ height: "100%" }} />
    </Stage>
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
