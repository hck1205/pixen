/**
 * The seams a host builds against: output policies, and plugins.
 */
import { useEffect, useRef, useState } from "react";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import { Row, Stage, useSampleImage } from "./harness.js";
import type { Story, StoryDefault } from "@ladle/react";

/**
 * One title across every story file, so the ids stay `editor--<story>` however
 * the files are arranged.
 */
export default {
  title: "Editor",
} satisfies StoryDefault;

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

/**
 * Level 4 customisation: a plugin.
 *
 * A plugin is a function called once with the element, the engine and the
 * strings. It adds a button beside Export and a control in the inspector — the
 * two places that were closed to hosts — and returns how to undo itself.
 */
export const Plugin: Story = () => {
  const image = useSampleImage();
  const [saved, setSaved] = useState<string | null>(null);
  const editor = useRef<PixenImageEditorHandle>(null);

  useEffect(() => {
    const element = editor.current?.element;
    if (!element) return;

    // `use` returns the element for chaining, so the teardown is captured here
    // rather than returned from the effect by mistake.
    let dispose: (() => void) | undefined;
    element.use((context) => {
      const remove = context.addAction({
        id: "save",
        label: "Save to server",
        text: "Save",
        emphasis: "primary",
        onClick: () => {
          void context.editor.export().then((result) => {
            setSaved(`${result.width} × ${result.height}, ${Math.round(result.bytes / 1024)} KB`);
          });
        },
      });

      const removeSection = context.addInspectorSection({
        id: "layer-count",
        build: () => {
          const node = document.createElement("span");
          node.textContent = `${context.editor.document.layers.length} layer(s)`;
          node.style.color = "#a2a8b8";
          node.style.fontSize = "12px";
          return [node];
        },
      });

      dispose = () => {
        remove();
        removeSection();
      };
      return dispose;
    });

    return () => dispose?.();
  }, [image]);

  return (
    <Stage
      title="Plugin"
      note={saved ? `The plugin's action exported: ${saved}` : "Draw something, then press Save."}
    >
      <PixenImageEditor ref={editor} src={image} style={{ height: "100%" }} />
    </Stage>
  );
};
