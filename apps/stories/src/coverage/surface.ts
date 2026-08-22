/**
 * What a person and a host actually touch: the interface itself, and
 * the ways an application embeds it.
 *
 * One slice of the coverage table. See `coverage/index.ts` for what the table
 * is and the rules it is kept honest by.
 */
import { browser, doc, list, story, unit, visual, type CoverageGroup } from "./evidence.js";
import { availableLocales } from "@pixen/web";

export const SURFACE_COVERAGE: CoverageGroup[] = [
  {
    title: "The interface",
    summary: "Everything about the editor that is not about the picture.",
    entries: [
      {
        capability: "Locales",
        layer: "Element",
        detail: list(availableLocales()),
        evidence: [unit("i18n.test.ts"), story("Locales")],
      },
      {
        capability: "Right to left",
        layer: "Element",
        detail: "Logical properties throughout; numeric readouts pinned to LTR so sizes stay readable",
        evidence: [unit("i18n.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Keyboard",
        layer: "Element",
        detail: "Tool shortcuts, undo and redo, arrow-key nudge with a fast modifier, Escape and Enter",
        evidence: [unit("keyboard.test.ts")],
      },
      {
        capability: "Accessibility",
        layer: "Element",
        detail:
          "Named controls, aria-pressed toggles, aria-keyshortcuts, and a live region that is polite " +
          "rather than assertive — it waits its turn instead of interrupting whatever a reader is in " +
          "the middle of",
        evidence: [unit("labels.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Theming",
        layer: "Element",
        detail:
          "Light and dark, driven by custom properties on the host. There is no `system` — nothing in " +
          "the package reads `prefers-color-scheme`, so a host that wants to follow the operating " +
          "system reads it and sets the attribute",
        evidence: [story("Themes"), story("Theming"), visual("visual.spec.ts")],
      },
      {
        capability: "Slots and parts",
        layer: "Element",
        detail:
          "Three slots replace the toolbar, the actions and the inspector; nine parts style everything " +
          "from the root to the drop overlay. Both are API — a browser test pins the exact names, " +
          "because a renamed part breaks a host's CSS without erroring anywhere",
        evidence: [browser("editor.spec.ts"), story("Slots"), doc("docs/FRAMEWORKS.md")],
      },
      {
        capability: "Small hosts",
        layer: "Element",
        detail: "The chrome reflows and the image re-fits around it rather than being covered",
        evidence: [unit("view.test.ts"), story("Compact"), browser("editor.spec.ts")],
      },
      {
        capability: "Plugins",
        layer: "Element",
        detail: "Actions and inspector sections contributed by a host, with a teardown per plugin",
        evidence: [unit("plugins.test.ts"), story("Plugin"), doc("docs/PLUGINS.md")],
      },
    ],
  },
  {
    title: "Integration",
    summary: "How it is dropped into an application.",
    entries: [
      {
        capability: "Frameworks",
        layer: "Bindings",
        detail: "@pixen/react, @pixen/vue, @pixen/svelte, and the custom element for everything else",
        evidence: [unit("bindings.test.ts"), story("ExportFlow"), doc("docs/FRAMEWORKS.md")],
      },
      {
        capability: "Events",
        layer: "Bindings",
        detail: "load, change, history, export and error, as DOM events and as framework props",
        evidence: [unit("bindings.test.ts"), story("EventLog")],
      },
      {
        capability: "Server rendering",
        layer: "Bindings",
        detail:
          "Every wrapper imports without a DOM and registers the element only in a browser — all four " +
          "of them now, React included, which is the one most likely to be server-rendered and was the " +
          "one with no test at all while this row said \"every\"",
        evidence: [unit("ssr.test.ts")],
      },
      {
        capability: "No runtime dependencies",
        layer: "Bindings",
        detail: "Published packages depend on nothing but each other",
        evidence: [unit("independence.test.ts"), doc("CONTRIBUTING.md")],
      },
      {
        capability: "Independent implementation",
        layer: "Engine",
        detail: "Derived from web platform specifications; no competitor code, assets or wording",
        evidence: [unit("independence.test.ts"), doc("docs/PROVENANCE.md")],
      },
    ],
  },
];
