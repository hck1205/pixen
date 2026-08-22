/**
 * The seams a host reaches into, and the rules it can impose.
 *
 * One slice of the verification matrix. This is the part of the comparison
 * where the supplied material was most specific, so most of these rows carry a
 * requirement. See `verification/claim.ts` for what a verdict may mean.
 */
import { browser, doc, required, story, unit, type ClaimGroup } from "../claim.js";

export const PIPELINE_CLAIMS: ClaimGroup[] = [
  {
    title: "Host seams",
    summary:
      "Five named points inside an export, plus two on the way in. Each one is a function the host " +
      "supplies; none of them is a subclass, a fork, or a patched build.",
    claims: [
      {
        capability: "The document, before it is drawn",
        pixen:
          "`document` receives the document about to be exported and returns the one to use — a watermark " +
          "only the exported copy carries, placeholder text filled in at the last moment",
        verdict: "met",
        market: required("image writer", "The state about to be drawn is the host's to rewrite — filling placeholder text, for one"),
        evidence: [unit("processing.test.ts"), story("Pipeline")],
      },
      {
        capability: "Resampling",
        pixen:
          "`resample` replaces the downscale for a large reduction — Lanczos, a WASM resizer, sharpening " +
          "after the shrink — and is a seam rather than a default because measuring showed the step-down " +
          "landed no closer to the true average on Chromium while costing about half a second at 24MP",
        verdict: "met",
        market: required("image writer", "The function that resizes the pixels is the host's to supply"),
        evidence: [unit("processing.test.ts"), doc("docs/ARCHITECTURE.md")],
      },
      {
        capability: "The drawn pixels",
        pixen: "`pixels` hands over the surface before it is encoded, to be drawn on in place",
        verdict: "met",
        market: required("image writer", "The drawn pixels are the host's to post-process — a circular crop mask, for one"),
        evidence: [unit("processing.test.ts"), story("Pipeline")],
      },
      {
        capability: "The encoded bytes",
        pixen:
          "`bytes` receives the encoded blob and returns the one to deliver — an AVIF encoder the browser " +
          "does not have, a compressor, a signature",
        verdict: "met",
        market: required("image writer", "The encoded blob is the host's to post-process, for a format the browser cannot write"),
        evidence: [unit("processing.test.ts"), story("Pipeline")],
      },
      {
        capability: "The source, before the edit is applied",
        pixen:
          "Not offered as an export step: `replaceSource` swaps the picture in the document, and " +
          "`resample` replaces the downscale, but there is no seam that hands over the source bitmap for " +
          "one export and leaves the document alone",
        verdict: "open",
        market: required(
          "image writer",
          "The source image data can be pre-processed for a single export — a third-party optimisation, or " +
          "a format conversion — before the edit is drawn onto it",
        ),
        evidence: [unit("processing.test.ts"), doc("docs/ARCHITECTURE.md")],
        note:
          "The two neighbouring seams exist, which is what makes this one a gap rather than a category: " +
          "everything is in place except the call",
      },
      {
        capability: "One writer for two media",
        pixen:
          "Two export calls: `export` for a still, `exportClip` for a moving one, each with its own " +
          "options — a host doing both states the shared ones twice",
        verdict: "open",
        market: required(
          "media writer",
          "Image and video writers grouped behind one configuration, so shared options are stated once",
        ),
        evidence: [doc("docs/ROADMAP.md")],
        note:
          "Small, and it only bites a host that ships both. Worth doing when the video package leaves " +
          "its first release rather than before",
      },
      {
        capability: "Hook order is observable",
        pixen: "The five hooks fire in a fixed order, and a story logs the order as it happens",
        verdict: "beyond",
        evidence: [story("HookOrder"), unit("processing.test.ts")],
      },
      {
        capability: "Policies",
        pixen:
          "A named set of output rules applied to a document — format, quality, size ceiling, metadata — " +
          "so a host states them once rather than at every call site",
        verdict: "unmeasured",
        evidence: [unit("processing.test.ts"), story("Policies"), doc("docs/ARCHITECTURE.md")],
      },
      {
        capability: "Plugins",
        pixen:
          "A documented extension surface: chrome actions with their own availability, and a registry the " +
          "element rebuilds from",
        verdict: "unmeasured",
        evidence: [unit("plugins.test.ts"), story("Plugin"), doc("docs/PLUGINS.md")],
      },
      {
        capability: "A plugin's own strings",
        pixen: "Not offered: a plugin cannot yet add locale strings of its own",
        verdict: "open",
        market: required(
          "video extension",
          "An extension shipped as a separate package brings its own translated interface with it",
        ),
        evidence: [doc("docs/ROADMAP.md"), doc("docs/PLUGINS.md")],
        note: "The gap the video package found: it has a timeline to label and nowhere to put the labels",
      },
      {
        capability: "Cancellation",
        pixen:
          "An AbortSignal on load, export and video export; an encode in progress cannot be interrupted by " +
          "any browser, so a cancel arriving mid-encode throws the result away rather than delivering it",
        verdict: "unmeasured",
        evidence: [unit("task-runner.test.ts"), story("Progress"), browser("editor.spec.ts")],
      },
      {
        capability: "Errors",
        pixen:
          "One error type with a machine-readable code and a cause, on an error channel of its own, so a " +
          "host can tell a refused file from a broken one",
        verdict: "unmeasured",
        evidence: [unit("validate.test.ts"), story("EventLog"), doc("docs/SECURITY.md")],
      },
    ],
  },
];
