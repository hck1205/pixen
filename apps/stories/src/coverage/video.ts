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
          "Kept parts in the document, undoable and serialisable like a crop. Stored in absolute " +
          "seconds rather than fractions, because half of a source whose length you have not got is " +
          "not a range — and replacing the picture underneath would silently move it",
        evidence: [unit("clip.test.ts"), browser("video.spec.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "Several kept parts",
        layer: "Engine",
        detail:
          "A clip is a list: the pause taken out of an interview, two answers out of a talk. They " +
          "export as one file in one recording pass, and the exported length is their total rather " +
          "than the span from the first start to the last end",
        evidence: [unit("clip.test.ts"), browser("video.spec.ts"), doc("docs/VIDEO.md")],
      },
      {
        capability: "Mark, then keep or cut",
        layer: "Element",
        detail:
          "The handles mark a stretch and the buttons say what to do with it, which is what makes " +
          "several kept parts reachable with the control already there. Marking is not an edit and " +
          "costs no undo step — the mark is where you are pointing, the button is where you decide",
        evidence: [browser("video.spec.ts")],
      },
      {
        capability: "The soundtrack",
        layer: "Engine",
        detail:
          "The clip keeps its sound at the level asked for. Recording a canvas records a canvas, so " +
          "every export used to come back silent whatever the source had; 0 leaves the track out of " +
          "the file rather than writing silence into it",
        evidence: [unit("audio.test.ts"), browser("video.spec.ts"), doc("docs/VIDEO.md")],
      },
      {
        capability: "Redaction on a moving picture",
        layer: "Engine",
        detail:
          "All four modes reach every frame, measured rather than assumed: a fine checkerboard at " +
          "full contrast comes back flat under a solid fill, smoothed under a blur, and moved around " +
          "under a scramble — while the half outside the region is untouched",
        evidence: [browser("video.spec.ts"), doc("docs/VIDEO.md")],
      },
      {
        capability: "Playing the clip",
        layer: "Engine",
        detail:
          "Playing a clip runs each kept part and skips what is between, which no media element " +
          "does — measured across a cut, fifteen position reports and none from inside it. What the " +
          "player reports is what it was asked for, so an export borrowing the element cannot make " +
          "it announce that the picture started",
        evidence: [unit("player.test.ts"), browser("video.spec.ts"), doc("docs/VIDEO.md")],
      },
      {
        capability: "Knowing the wait before taking it",
        layer: "Engine",
        detail:
          "`clipExportCost` says how much film comes out, roughly how long making it will take, and " +
          "whether that is past the line this host draws. Not a refusal — the moment to offer a " +
          "server instead of starting a four-minute wait nobody agreed to",
        evidence: [unit("cost.test.ts"), browser("video.spec.ts"), doc("docs/VIDEO.md")],
      },
      {
        capability: "A clip has a name, and a wire",
        layer: "Engine",
        detail:
          "An exported clip is named from the source's own with the container actually written, and " +
          "goes to a server through the same `uploadExport` a still picture does — which asked for a " +
          "whole ExportResult when it only ever read the bytes and the name",
        evidence: [unit("cost.test.ts"), browser("video.spec.ts")],
      },
      {
        capability: "A length a host requires",
        layer: "Engine",
        detail:
          "A floor and a ceiling on the kept length — an advert slot, an upload limit. On what is " +
          "kept rather than on what may be loaded: a long source opens as it always did, and the " +
          "handle being dragged is the one that stops",
        evidence: [unit("clip.test.ts"), unit("track.test.ts"), browser("video.spec.ts")],
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
          "A thirty-second clip takes thirty seconds — timed, not just described. MediaRecorder samples " +
          "a canvas as it is painted and cannot be asked to hurry, which is also the reason an export " +
          "can be called off halfway: there is a whole clip's worth of time to change your mind in",
        evidence: [browser("video.spec.ts"), doc("docs/ROADMAP.md")],
      },
      {
        capability: "WebM, or your own encoder",
        layer: "Engine",
        detail:
          "Measured in the Chromium this suite runs against: VP8, VP9 and bare WebM are all accepted, a " +
          "bare video/mp4 request is accepted too while an explicit H.264 one is refused, and VideoEncoder " +
          "is absent. Pixen asks for WebM because that is the answer it can rely on; WebCodecs is what a " +
          "host reaches for through the recorder seam — driven by a test that hands back an MP4 Pixen's " +
          "own recorder would not have written",
        evidence: [browser("video.spec.ts"), doc("docs/ROADMAP.md")],
      },
      {
        capability: "A failed export says so",
        layer: "Engine",
        detail:
          "A recorder that fails, or stops before the clip does, or produces nothing at all, rejects " +
          "rather than handing back an empty file — which is the worst outcome an export API has, " +
          "because it is indistinguishable from success until somebody opens it",
        evidence: [browser("video.spec.ts")],
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
