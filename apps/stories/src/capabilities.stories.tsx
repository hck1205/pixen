/**
 * The stories that exist to be checked against a specification rather than
 * admired: the styling surface, the layer list, the output panel and multi-size
 * export. What happens around an edit — a host round trip, progress — is in
 * `lifecycle.stories.tsx`.
 *
 * The coverage table that ties each of these to the suite proving it is next
 * door, in `coverage.stories.tsx`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEllipseLayer,
  createLineLayer,
  createRectLayer,
  createTextLayer,
  srcset,
  type Editor,
  type ExportVariant,
  type ProgressReport,
} from "@pixen/core";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import { seedStyling } from "./fixtures.js";
import { Row, SeededEditor, Stage, formatBytes, useSampleImage } from "./harness.js";
import { codeBlock, hostButton, logList, note, panelTitle, table, tableCell, tableHeader } from "./styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Editor",
} satisfies StoryDefault;

export const Styling: Story = () => {
  const image = useSampleImage();
  return (
    <Stage
      title="Styling"
      note="Fill, dashes, corner radius, both arrowheads, alignment and a text plate. Pick a tool, or select a shape, and the inspector offers exactly what that kind of layer has."
    >
      <SeededEditor image={image} seed={seedStyling} tool="select" />
    </Stage>
  );
};

/** The layer list: order, visibility and locking, over the same seeded stack. */
export const Layers: Story = () => {
  const image = useSampleImage();
  return (
    <Stage
      title="Layers"
      note="Topmost first, which is the opposite of the order they are painted in. A hidden layer leaves the canvas; a locked one stays but stops responding to the pointer, and loses its handles."
    >
      <SeededEditor image={image} seed={seedStyling} panel="layers" />
    </Stage>
  );
};
