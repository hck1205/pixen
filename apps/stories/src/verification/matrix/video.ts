/**
 * The moving picture, which is a separate package and a separate sale.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, doc, required, story, unit, type ClaimGroup } from "../claim.js";

export const VIDEO_CLAIMS: ClaimGroup[] = [
  {
    title: "Video",
    summary:
      "Sold separately as `@pixen/video`, because it is a different product with different costs — not " +
      "because the editor could not carry it. It turned out that it could, and cheaply.",
    claims: [
      {
        capability: "A moving source",
        pixen:
          "An HTMLVideoElement is already a drawable source, so it is adopted as one — and the crop, the " +
          "straightening, the adjustments and every annotation reach each frame through the scene that " +
          "was already there, without one of them learning that the picture moves",
        verdict: "met",
        market: required("video extension", "The image tools apply to a video as they do to a photograph"),
        evidence: [browser("video.spec.ts"), doc("docs/ROADMAP.md")],
        note:
          "The supplied material scopes that requirement: it names redaction, frames and fill as " +
          "unavailable on a moving source. Pixen draws every frame through the scene the still export " +
          "uses, so there is no list of tools that stop working — which is a consequence of the " +
          "architecture rather than an effort anyone made",
      },
      {
        capability: "Trim",
        pixen:
          "A clip range in the document, undoable and serialisable like a crop, stored in absolute seconds " +
          "rather than fractions of a length the source may not have stated yet",
        verdict: "met",
        market: required(
          "video extension",
          "A start and an end, chosen on the clip, given as fractions of its length and kept with the edit",
        ),
        evidence: [unit("clip.test.ts"), browser("video.spec.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
        note:
          "Absolute seconds rather than the fractions the material uses, deliberately: half of a source " +
          "whose length you have not got is not a range, and replacing the picture underneath would " +
          "silently move a fraction while leaving a second where it was",
      },
      {
        capability: "A timeline",
        pixen: "Not offered: the range is set through the API, and there are no handles to drag",
        verdict: "open",
        market: required("video extension", "Handles on a timeline strip, dragged to set the trim"),
        evidence: [doc("docs/ROADMAP.md")],
        note: "Blocked behind the plugin-strings gap above: a timeline shipped in a separate package has nothing to label itself with",
      },
      {
        capability: "Export",
        pixen: "The trimmed clip re-encoded, with progress in the clip's own seconds and a cancel that works",
        verdict: "met",
        market: required("video extension", "The trimmed clip is written back out as a file"),
        evidence: [browser("video.spec.ts"), story("VideoCodecs")],
      },
      {
        capability: "What it costs",
        pixen:
          "Wall-clock: a thirty-second clip takes thirty seconds, because MediaRecorder samples a canvas " +
          "as it is painted and cannot be hurried. Timed in the browser suite rather than assumed",
        verdict: "unmeasured",
        evidence: [browser("video.spec.ts"), doc("docs/ROADMAP.md")],
        note: "Stated on this page rather than in a footnote: a host that discovers it after building on it has been misled by an omission",
      },
      {
        capability: "The container",
        pixen:
          "WebM, asked for in preference order — VP9, VP8, then whatever the browser picks. What any one " +
          "browser will write is that browser's answer rather than Pixen's, which is why the probe beside " +
          "this table asks the browser in front of you instead of quoting a measurement taken elsewhere",
        verdict: "unmeasured",
        evidence: [browser("video.spec.ts"), story("VideoCodecs")],
      },
      {
        capability: "Your own encoder",
        pixen:
          "A recorder seam takes the frames somewhere else — WebCodecs, a WASM encoder, an upload that " +
          "streams — driven by a test that hands back an MP4 Pixen's own recorder could not have written",
        verdict: "met",
        market: required("video extension", "The encoder that writes the output video is chosen by the host"),
        evidence: [browser("video.spec.ts")],
        note:
          "Met, and with a working default behind it: the supplied material asks the host to set an " +
          "encoder before anything can be written, where Pixen records WebM out of the box and takes one " +
          "only when that is not enough",
      },
      {
        capability: "A failed export says so",
        pixen:
          "A recorder that fails, stops early, or produces nothing rejects rather than handing back an " +
          "empty file — the worst outcome an export API has, because it looks like success until somebody opens it",
        verdict: "beyond",
        evidence: [browser("video.spec.ts")],
      },
    ],
  },
];
