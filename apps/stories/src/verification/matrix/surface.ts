/**
 * The surface a person touches and a host integrates against.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, doc, list, required, story, unit, visual, type ClaimGroup } from "../claim.js";
import { availableLocales, OBSERVED_ATTRIBUTES, PIXEN_EVENTS } from "@pixen/web";

const LOCALES = availableLocales();

export const SURFACE_CLAIMS: ClaimGroup[] = [
  {
    title: "The element",
    summary: "One custom element, and the contract around it that a host may rely on.",
    claims: [
      {
        capability: "Attributes",
        pixen: list(OBSERVED_ATTRIBUTES),
        verdict: "unmeasured",
        evidence: [unit("attributes.test.ts"), story("Playground"), browser("editor.spec.ts")],
      },
      {
        capability: "Events",
        pixen: list(PIXEN_EVENTS.map((name) => `pixen-${name}`)),
        verdict: "met",
        market: required(
          "image events",
          "Start, progress, abort, error and finish for both the load and the export, plus one for every " +
          "change to the edit state",
        ),
        evidence: [unit("observe.test.ts"), story("EventLog"), browser("editor.spec.ts")],
        note:
          "One error channel rather than one per phase, and `change` carries the whole document. The one " +
          "the supplied list has and this does not is a preview-ready event — see the intake page",
      },
      {
        capability: "Slots and parts",
        pixen:
          "The actions, the tool rail and the inspector are each a slot with a default inside it — replace " +
          "one and keep the others — and nine `part` names for styling from outside the shadow root",
        verdict: "unmeasured",
        evidence: [story("Slots"), story("Theming"), browser("editor.spec.ts")],
      },
      {
        capability: "Theming",
        pixen:
          "Custom properties for surface, text, accent, border, radius and the canvas chrome; a light " +
          "theme that redefines them rather than a second stylesheet",
        verdict: "unmeasured",
        evidence: [story("Themes"), story("Tokens"), visual("visual.spec.ts")],
      },
      {
        capability: "No framework required",
        pixen: "The element is plain DOM; the wrappers are thin and optional",
        verdict: "unmeasured",
        evidence: [unit("ssr.test.ts"), story("Slots"), doc("docs/FRAMEWORKS.md")],
      },
    ],
  },
  {
    title: "Reach",
    summary: "Who can use it, in which language, on which browser.",
    claims: [
      {
        capability: "Locales",
        pixen: `${LOCALES.length} — ${list(LOCALES)}`,
        verdict: "unmeasured",
        evidence: [unit("i18n.test.ts"), story("Locales"), visual("visual.spec.ts")],
        note: "Every string in every locale, checked by a test that fails on a key present in one and missing in another",
      },
      {
        capability: "Right to left",
        pixen: "The layout mirrors for Arabic, driven by the locale rather than by a separate flag",
        verdict: "unmeasured",
        evidence: [unit("i18n.test.ts"), story("Locales"), visual("visual.spec.ts")],
      },
      {
        capability: "Keyboard",
        pixen:
          "Undo, redo, fit, delete, escape, arrow-key nudges, Enter to edit text, and a letter per tool — " +
          "resolved by a pure function, so what a keystroke means is answerable in a test",
        verdict: "unmeasured",
        evidence: [unit("keyboard.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Accessibility",
        pixen:
          "Roles, accessible names, pressed state, live-region announcements, focus restored after the " +
          "canvas takes a pointer, and reduced-motion honoured",
        verdict: "unmeasured",
        evidence: [unit("labels.test.ts"), unit("availability.test.ts"), browser("editor.spec.ts")],
        note: "The story browser runs an accessibility addon over every story, which is where regressions surface first",
      },
      {
        capability: "Browser support",
        pixen:
          "A stated floor, and a capability report a host can read at runtime — every optional API has a " +
          "written fallback rather than a broken screen",
        verdict: "unmeasured",
        evidence: [unit("support.test.ts"), story("SupportReport"), doc("docs/BROWSER-SUPPORT.md")],
      },
      {
        capability: "Framework bindings",
        pixen: "React, Vue and Svelte, each a wrapper over the same element, plus plain HTML",
        verdict: "unmeasured",
        evidence: [unit("bindings.test.ts"), unit("ssr.test.ts"), story("ExportFlow"), doc("docs/FRAMEWORKS.md")],
      },
    ],
  },
];
