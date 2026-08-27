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
        pixen:
          "A strip with the kept region shown and a handle at each end, installed as a plugin the way the " +
          "extension is sold — draggable, keyboard-operable, announced, and one undo step per drag",
        verdict: "met",
        market: required("video extension", "Handles on a timeline strip, dragged to set the trim"),
        evidence: [unit("track.test.ts"), browser("video.spec.ts"), doc("docs/ROADMAP.md")],
        note:
          "The handles are range inputs. Two of them over one track is fiddlier to style than two divs " +
          "would be, and it is what makes the strip reachable from a keyboard and announced — neither of " +
          "which a div gets without being rebuilt into one. Dragging the start past the end stops at the " +
          "end rather than swapping them: the pointer is already past it, and a swap makes the picture " +
          "jump out from under the finger",
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
      {
        capability: "The soundtrack",
        pixen:
          "The clip keeps its sound at the level asked for. `0` leaves the track out of the file " +
          "rather than writing silence into it, and the container then stops claiming an Opus track " +
          "it has nothing to put in",
        verdict: "met",
        market: required("video properties", "The output volume is controllable, and zero removes the audio track"),
        evidence: [unit("audio.test.ts"), browser("video.spec.ts"), doc("docs/VIDEO.md")],
        note:
          "Found by measuring rather than by reading: recording a canvas records a canvas, so every " +
          "exported clip came back silent whatever the source had — one audio track in, none out",
      },
      {
        capability: "Several kept parts",
        pixen:
          "A clip is a list of kept parts, in order and never overlapping. They export as one file in " +
          "one recording pass, and the exported length is their total rather than the span from the " +
          "first start to the last end",
        verdict: "met",
        market: required("video properties", "Trimming describes more than one kept range"),
        evidence: [unit("clip.test.ts"), browser("video.spec.ts"), doc("docs/VIDEO.md")],
        note:
          "Stored in absolute seconds rather than as fractions, for the reason the single range " +
          "already was: half of a source whose length you have not got is not a range",
      },
      {
        capability: "A length a host requires",
        pixen:
          "A floor and a ceiling on the kept length. On what is kept rather than on what may be " +
          "loaded: a long source opens as it always did, and the handle being dragged is the one that " +
          "stops",
        verdict: "met",
        market: required("video properties", "A minimum and a maximum duration, enforced by the trim UI"),
        evidence: [unit("clip.test.ts"), unit("track.test.ts"), browser("video.spec.ts")],
      },
      {
        capability: "Playing the clip",
        pixen:
          "Playing a clip runs each kept part and skips what is between — measured across a cut, " +
          "fifteen position reports and none from inside it. What the player reports is what it was " +
          "asked for, so an export borrowing the element cannot make it announce that the picture " +
          "started",
        verdict: "met",
        market: required("video methods and events", "play, pause, mute, current time, duration, and events for them"),
        evidence: [unit("player.test.ts"), browser("video.spec.ts"), doc("docs/VIDEO.md")],
        note:
          "The editor could trim a video it could not play. The requirement was for six one-line calls " +
          "over a media element; what is here plays the clip rather than the file, which is the part " +
          "the platform cannot do",
      },
      {
        capability: "Knowing the wait before taking it",
        pixen:
          "`clipExportCost` says how much film comes out, roughly how long making it will take, and " +
          "whether that is past the line this host draws — not a refusal, but the moment to offer a " +
          "server instead of starting a four-minute wait nobody agreed to",
        verdict: "met",
        market: required("video server", "Encoding longer content belongs on a server rather than in the browser"),
        evidence: [unit("cost.test.ts"), browser("video.spec.ts"), doc("docs/VIDEO.md")],
      },
      {
        capability: "An encoder chain with fallbacks",
        pixen:
          "`recorderChain` tries each encoder in turn and records with the first that builds. The last " +
          "is the fallback, and its failure is the chain's — it is the one that was supposed to work " +
          "anywhere, so its reason is the one worth reading. The picture and the sound have their own " +
          "bitrates, because a talk and a screen recording want opposite things",
        verdict: "met",
        market: required("video exports", "Several encoders, chained, with a media-stream fallback"),
        evidence: [unit("chain.test.ts"), doc("docs/VIDEO.md")],
        note:
          "Pixen ships one encoder to put in a chain. The others named in the supplied material are " +
          "third-party libraries — a WASM build of a transcoder, a muxer — which a published package " +
          "here cannot depend on, so the seam is where they go",
      },
    ],
  },
];
