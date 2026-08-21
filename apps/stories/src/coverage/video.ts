/**
 * What `@pixen/video` adds, and what it costs.
 *
 * A separate slice because it is a separate package, sold separately — but it
 * belongs on this page, because "can it do video" is exactly the question this
 * table exists to answer without anyone taking a README's word for it.
 *
 * The costs are in the table rather than in a footnote. Both were measured, and
 * a host that discovers wall-clock recording after building a feature on it has
 * been misled by an omission.
 */
import { browser, doc, unit, type CoverageGroup } from "./evidence.js";

export const VIDEO_COVERAGE: CoverageGroup[] = [
  {
    title: "Video",
    summary: "A separate package. The editor does not become a video editor; a video becomes a source.",
    entries: [
      {
        capability: "A moving source",
        layer: "Engine",
        detail:
          "An HTMLVideoElement is already a drawable source, so it is adopted as one — which means the " +
          "crop, the straightening, the adjustments and every annotation reach each frame through the " +
          "scene that was already there, without one of them learning that the picture moves",
        evidence: [browser("video.spec.ts"), doc("docs/ROADMAP.md")],
      },
      {
        capability: "Trim",
        layer: "Engine",
        detail:
          "A clip range in the document, undoable and serialisable like a crop. Stored in absolute " +
          "seconds rather than fractions, because half of a source whose length you have not got is " +
          "not a range — and replacing the picture underneath would silently move it",
        evidence: [unit("clip.test.ts"), browser("video.spec.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "A video is never proxied",
        layer: "Engine",
        detail:
          "The preview proxy keeps a 48-megapixel photograph interactive by drawing a smaller copy of " +
          "it. A copy of a video is one frame of it, so a moving source is drawn from directly however " +
          "large it is — otherwise the picture freezes the moment the proxy is built",
        evidence: [unit("resources.test.ts")],
      },
      {
        capability: "Export runs in real time",
        layer: "Engine",
        detail:
          "A thirty-second clip takes thirty seconds. MediaRecorder samples a canvas as it is painted " +
          "and cannot be asked to hurry — which is also the reason an export can be called off halfway, " +
          "because there is a whole clip's worth of time to change your mind in",
        evidence: [browser("video.spec.ts"), doc("docs/ROADMAP.md")],
      },
      {
        capability: "WebM, or your own encoder",
        layer: "Engine",
        detail:
          "Measured, MediaRecorder writes VP8 and VP9 in WebM here and refuses H.264 and MP4 outright, " +
          "while VideoEncoder is undefined even with the flags on. So WebCodecs is not what Pixen " +
          "depends on, and is exactly what a host reaches for through the recorder seam",
        evidence: [browser("video.spec.ts"), doc("docs/ROADMAP.md")],
      },
      {
        capability: "The source is released with the resource",
        layer: "Engine",
        detail:
          "A video reads from an object URL for as long as it is open, so it is revoked when the " +
          "resource is let go rather than at the end of the load — without which the whole file stays " +
          "in memory for the life of the page",
        evidence: [unit("resources.test.ts"), browser("video.spec.ts")],
      },
    ],
  },
];
