/**
 * The claims that are not features — the ones a buyer's diligence asks about.
 *
 * They belong in a comparison because they are the questions that decide a
 * purchase after the feature lists have been ticked off: what does it drag into
 * my bundle, what happens when it breaks, and can you prove where it came from.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, doc, story, unit, visual, type ClaimGroup } from "../claim.js";

export const ASSURANCE_CLAIMS: ClaimGroup[] = [
  {
    title: "Assurance",
    summary:
      "Not features. The properties that decide a purchase once the feature lists have both been ticked " +
      "off, each of them checked by something that runs rather than asserted in a README.",
    claims: [
      {
        capability: "Zero runtime dependencies",
        pixen:
          "Every published package declares no third-party runtime dependency, and a scan fails the build " +
          "if one appears — so what a host ships is Pixen and the platform, with no transitive tree",
        verdict: "beyond",
        evidence: [unit("independence.test.ts"), doc("CONTRIBUTING.md")],
      },
      {
        capability: "Independent implementation",
        pixen:
          "Written from web platform specifications, published file-format specifications and first " +
          "principles, recorded module by module — with a scan that fails on a competitor's name, a " +
          "vendored directory, a minified bundle or a foreign licence header in the tree",
        verdict: "beyond",
        evidence: [unit("independence.test.ts"), doc("docs/PROVENANCE.md")],
        note: "This page is written under that rule, which is why it names no one",
      },
      {
        capability: "Four suites",
        pixen:
          "Unit tests with no DOM, a Playwright suite driving the built bundle, an opt-in visual suite " +
          "over the stories, and this story browser — each answering what the others cannot",
        verdict: "unmeasured",
        evidence: [unit("coverage.test.ts"), browser("editor.spec.ts"), visual("visual.spec.ts"), doc("docs/TESTING.md")],
      },
      {
        capability: "Claims that cannot drift",
        pixen:
          "Every capability on the coverage page names the suite that fails if it stops being true, and a " +
          "unit test checks that each of those files and stories exists",
        verdict: "beyond",
        evidence: [unit("coverage.test.ts"), story("Coverage")],
      },
      {
        capability: "Schema migrations",
        pixen:
          "A document saved by an older version is migrated step by step to the current one, and a schema " +
          "change ships with its migration in the same change rather than later",
        verdict: "unmeasured",
        evidence: [unit("document.test.ts"), story("SaveAndResume"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "Nothing leaves the browser",
        pixen:
          "Decoding, editing and encoding all happen on the client; the only network calls are the ones a " +
          "host asks for — a source URL it named, an upload it configured",
        verdict: "unmeasured",
        evidence: [unit("upload.test.ts"), doc("docs/SECURITY.md")],
      },
      {
        capability: "Hostile input",
        pixen:
          "A pixel ceiling that refuses a decompression bomb with a named error, and a metadata policy " +
          "that strips by default rather than carrying a photograph's location into a public file",
        verdict: "unmeasured",
        evidence: [unit("canvas.test.ts"), unit("metadata.test.ts"), doc("docs/SECURITY.md")],
      },
      {
        capability: "Bounded modules",
        pixen:
          "A scan fails on a source file past 300 lines unless its reason is written down, and a written " +
          "reason is pinned to the size it was written at, so it cannot become room to grow",
        verdict: "beyond",
        evidence: [unit("module-budget.test.ts"), doc("CLAUDE.md")],
      },
      {
        capability: "No dead exports",
        pixen:
          "A scan fails on an export nothing imports, with a short allowlist for genuine host-facing seams " +
          "— so the public surface is what is used rather than what accumulated",
        verdict: "beyond",
        evidence: [unit("unused-exports.test.ts"), doc("CLAUDE.md")],
      },
    ],
  },
];
