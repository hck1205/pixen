/**
 * What gets added to the picture rather than done to it — marks, stickers,
 * frames, and the colour adjustments that dress the whole thing.
 */
import { useEffect, useRef, useState } from "react";
import {
  ADJUSTMENT_KEYS,
  ADJUSTMENT_PRESETS,
  ADJUSTMENT_RANGES,
  FRAME_STYLES,
  presetAdjustments,
  type WatermarkPosition,
} from "@pixen/core";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import {
  createStickers,
  seedWatermark,
} from "./fixtures.js";
import { Row, SeededEditor, Stage, useSampleImage } from "./harness.js";
import type { Story, StoryDefault } from "@ladle/react";

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

/**
 * One title across every story file, so the ids stay `editor--<story>` however
 * the files are arranged.
 */
export default {
  title: "Editor",
} satisfies StoryDefault;

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
