/**
 * The editor itself: loading, the tools, and what each one puts on the picture.
 */
import { useRef } from "react";
import {
  REDACTION_MODES,
  type RedactionMode,
} from "@pixen/core";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import {
  createTransparentSample,
  seedAnnotations,
  seedRedaction,
  seedWatermark,
} from "./fixtures.js";
import { Row, SeededEditor, Stage, useAsync, useSampleImage } from "./harness.js";
import type { Story, StoryDefault } from "@ladle/react";

/** What each redaction mode actually promises, in the words the docs use. */
const REDACTION_MODE_NOTES: Record<RedactionMode, string> = {
  solid: "Replaces the pixels. The only mode to use for an identifier.",
  blur: "Softens the pixels. The weakest: a known radius can be partly undone.",
  pixelate: "Averages blocks. Not invertible, but the arrangement is still there.",
  scramble: "Averages blocks and shuffles them, so the arrangement goes too.",
};

/**
 * One title across every story file, so the ids stay `editor--<story>` however
 * the files are arranged.
 */
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

/** A transparent PNG: alpha in the viewport, and what JPEG export does with it. */
export const Transparency: Story = () => {
  const image = useAsync(() => createTransparentSample(), []);
  return (
    <Stage
      title="Transparent source"
      note="PNG keeps the alpha. Exporting to JPEG paints the configured background instead, since JPEG has no alpha."
    >
      <PixenImageEditor src={image} style={{ height: "100%" }} />
    </Stage>
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
