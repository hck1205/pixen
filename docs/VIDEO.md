# Video

`@pixen/video` is sold and shipped separately. Read this before choosing it:
two of its costs are large, both were measured rather than assumed, and neither
is a footnote.

The editor does not become a video editor. A video is registered as the source
like any other picture, and every existing feature reaches every frame through
the scene that was already there. What the package adds is the two things that
are genuinely about time — which part is kept, and how it is written out.

## Installing it

```bash
pnpm add @pixen/video
```

```js
import { openVideo, exportClip, trimPlugin } from "@pixen/video";

editor.use(trimPlugin);                       // the trim strip in the inspector
const { element, duration } = await openVideo(editor, file);
const clip = await exportClip(editor.document, element, editor.resources);
```

That is the whole installation. There is no second stylesheet to import and no
locale object to spread into the editor's own: a plugin brings its own styles
and its own strings, in all nine languages, through the seams in
`docs/PLUGINS.md`. A host that forgets a CSS import gets a control with no
styling and no error, so there is nothing here to forget.

## The two costs

### Recording runs at wall-clock speed

A thirty-second clip takes thirty seconds. `MediaRecorder` samples a canvas as
it is painted and cannot be asked to hurry, so there is no fast path and no
progress to be made by trying.

Measured in the Chromium this repository tests against, exporting the
playground's sample clip:

| Clip length | Wall clock |
| --- | --- |
| 1.98 s | 1.99 s |
| 3.98 s | 3.98 s |

That is 1.00×, which is the number to plan around: a user waits for the length
of their own video. Progress is reported in the clip's own seconds
(`onProgress`, stage `render`), so the wait can at least be shown honestly.

### It writes WebM

MP4 is not on offer. The candidate list is VP9, then VP8, then bare `video/webm`
— the first the browser accepts is used, and the container actually written
comes back on the result as `type`.

`MediaRecorder.isTypeSupported`, measured in the same browser, on the day this
was written:

| Asked for | Answer |
| --- | --- |
| `video/webm;codecs=vp9` | yes |
| `video/webm;codecs=vp8` | yes |
| `video/webm;codecs=av01` | yes |
| `video/webm` | yes |
| `video/mp4` | yes |
| `video/mp4;codecs=avc1.42E01E` | **no** |
| `video/x-matroska;codecs=avc1` | **no** |

The bare `video/mp4` answer is why the result names the type actually written
rather than the type asked for: a browser saying yes to a container and no to
every profile of its codec is a yes worth nothing. Pixen's own candidates are
WebM only, and `supportedRecordingType()` will tell you what this browser would
write before you start.

### Knowing before you pay

The wait is knowable in advance, which is the point of knowing it:

```js
const cost = clipExportCost(editor.document);   // or (document, 60) for your own line
cost.seconds;            // how much film comes out
cost.estimatedSeconds;   // roughly how long making it will take
cost.long;               // past the threshold — offer a server instead
```

`long` is not a refusal. It is the moment to say "this will take four minutes"
and offer the alternative, rather than starting a four-minute wait a person did
not agree to. Past a couple of minutes, encoding on a server is the honest
answer, and the seam below is how the frames get there.

### The way out of both

`ClipRecorder` is the seam. Hand `exportClip` a `recorder` and the frames go
wherever you send them — WebCodecs, a WASM encoder, an upload that streams:

```js
await exportClip(document, element, resources, {
  recorder: (canvas, size) => myEncoder(canvas, size),
});
```

`VideoEncoder` is what a host would reach for there, and it is not something
Pixen can depend on: it is present in the Chromium this repository tests against
today and absent in another Chromium on the same machine. That is why the story
browser asks the browser in front of you rather than repeating a number measured
somewhere else.

A recorder is also where a server goes. `frame(seconds)` is called with each
painted frame still on the canvas, so an implementation that reads the canvas
and posts it — or opens a socket and streams it — moves the encoding off the
machine without the editor knowing anything about it. The document travels as
JSON, so the other honest shape is to send that instead and re-render from the
original file; which of the two is right depends on whether the server has the
source.

### Delivering the file

An exported clip is named, and goes down the same wire a still picture does:

```js
const written = await exportClip(document, element, resources);
written.filename;                                   // "interview-edited.webm"
await uploadExport(written, { url: "/clips" });     // from @pixen/core
```

## What applies to a moving picture

Everything in the first column goes through the same `createScene` and
`renderScene` the still export uses, so it lands on every frame without knowing
the picture moves.

| Reaches every frame | Time and sound only | Still pictures only |
| --- | --- | --- |
| Crop and aspect ratio | The clip range | EXIF carried from the source |
| Rotation, flip, straighten | The trim strip | `quality` and `maxBytes` |
| All adjustments and presets | The soundtrack's level | `maxPixels` |
| Frames and vignette | | `exportVariants`, `processImages` |
| Every annotation, including redaction | | The preview proxy |

Three of those deserve their own line:

- **There is no preview proxy.** A resource with a duration is never downscaled
  into a stand-in bitmap, so `previewMaxSize` does nothing and the viewport is
  always drawing the real thing.
- **`bitrate` replaces `quality`.** A recording has no re-encode loop to fit a
  byte budget, so `maxBytes` has no equivalent — ask for a bitrate instead.
- **The sound comes with the picture.** See below.

## The soundtrack

The clip keeps its sound. `volume` is a multiplier on the source's own level:

```js
await exportClip(document, element, resources, { volume: 0.25 });  // quieter
await exportClip(document, element, resources, { volume: 0 });     // no audio track
```

Omitted keeps the sound exactly as it is — no gain stage, so the original track
is re-recorded rather than a resampled copy of it. `0` leaves the track out of
the file rather than writing silence into it, which is a different thing to
everything downstream, and the container then stops claiming an Opus track it
has nothing to put in. Above `1` amplifies, and clips like anything else would.
`hasSound` on the result says which happened.

Measured on a steady tone: kept at the source's own level within a thousandth,
a quarter asked for and a quarter measured, and `0` producing a file with no
audio track at all.

A source with no sound of its own is silent whatever is asked for, and so is one
the page may not read — the same cross-origin wall the frames hit, below.

## Playing it

The editor could trim a video it could not play, which is trimming blind.
`ClipPlayer` plays the *clip* rather than the file:

```js
const { element } = await openVideo(editor, file);
const player = new ClipPlayer(element, editor);

editor.use(createTrimPlugin({}, () => player));   // a play button on the strip

player.play();          // and pause(), toggle(), paused
player.mute();          // and unmute(), toggleMute(), muted
player.currentTime;     // seconds in the source; setting it lands on kept film
player.duration;        // the source's own
player.clipDuration;    // what the kept parts add up to — what an export writes
player.on("time", ({ source, clip }) => …);   // and "play", "pause", "mute"
```

Playing a clip runs each kept part and skips what is between, which is the thing
no media element does. Measured across a cut: fifteen position reports and not
one of them from inside the removed stretch. Setting `currentTime` into a cut
lands on the start of the next kept part, because that is where playing from
there would have gone anyway.

**What it reports is what it was asked for, not what the element is doing.** An
export borrows the same element and plays it — measured, a host listening to the
element hears a `play` and a `pause` it never asked for — so a player that
echoed the element would announce that the picture started every time somebody
saved. Pause before exporting; what comes back is still paused.

The element arrives muted, because a browser will not play an unmuted video
nobody clicked on and the export needs it that way. The sound button is how it
comes back.

## Keeping more than one part

A clip is a list of kept parts, in order and never overlapping:

```js
editor.dispatch({
  kind: "set-clip",
  range: [
    { start: 0, end: 12 },     // the question
    { start: 95, end: 140 },   // the answer, without the pause in between
  ],
});
```

They export as one file, in one recording pass. The seek between parts costs a
moment of wall clock and nothing in the file: the recorder is sampling a canvas,
and the canvas goes on showing the last frame of one part until the first frame
of the next arrives. Measured on the three-second sample — a red second, a green
one and a blue one — keeping the red and the blue gives a 1.2-second file with
red at the front, blue at the back and no green anywhere in it.

The exported length is the *total* of the parts, not the span from the first
start to the last end, and that total is what a length rule is measured against.

Parts that touch or overlap are merged rather than refused, because two
overlapping ranges describe one kept stretch and that is what the export would
write anyway. Cutting away everything leaves the selection alone: a clip has to
be *something*, and an empty selection is not a shorter film but no film.

### In the strip

The two handles mark a stretch of the source and three buttons say what to do
with it — **Keep**, **Cut out**, **Whole clip**. That is what makes several kept
parts reachable with the control already there: mark the pause and cut it out,
and what is left is the two halves either side of it.

Marking is not an edit. Dragging a handle changes nothing about the document and
costs no undo step — the mark is where you are pointing, not what you have
decided — so a whole gesture of marking and pressing a button is one step.

## How long a clip may be

A host that accepts clips usually has a rule about the length — an advert slot,
an upload limit, a format that wants at least a few seconds. The rule is on the
*kept* length, not on what may be loaded: a long source opens as it always did,
and it is the clip that is held inside the bound.

```js
editor.use(createTrimPlugin({ min: 3, max: 30 }));
```

The handles stop rather than the file being refused, and the one that stops is
the one being dragged — a start handle that quietly pulled the far end along
with it would be moving a part of the clip nobody had hold of. A document with
no trim shows the longest clip the rule allows rather than the whole source, so
the interface does not disagree with itself before anyone has touched it, and
clearing a trim under a ceiling leaves that same clip rather than none at all.

A floor longer than the source cannot be met, and the honest answer is the whole
source rather than a range running off the end.

The same bounds ride on the intent, for a host driving the engine directly:

```js
editor.dispatch({ kind: "set-clip", range: { start: 5, end: 40 }, bounds: { max: 30 } });
```

## Exporting the right kind of thing

`exportMedia` decides from the document, because a document with a duration came
from a moving source and one without did not:

```js
const result = await exportMedia(editor.document, editor.resources, { element });
result.kind; // "image" or "video"
```

It needs the video element for a moving document, and refuses with
`INVALID_STATE` when it is not given one — rather than quietly exporting a
single frame.

A single frame is still available on purpose: calling the still export on a
moving document gives you the frame currently showing, which is how you get a
poster image. Measured, that is an ordinary PNG at the document's output size.

## The failure that will actually happen

A clip usually lives on a CDN, and a video from another origin with no
`Access-Control-Allow-Origin` header **cannot be recorded at all**. This is not
a degradation: the still export merely loses the effects that read pixels back —
a blur redaction falls back to a solid fill — while a recording produces nothing.

It used to produce nothing *and say it had worked*. The canvas is clean when
`captureStream` accepts it and is tainted by the first frame drawn into it, so
the capture track goes quiet and `MediaRecorder` writes a 110-byte header. The
emptiness check asked whether the file was zero bytes, and a header is not zero
bytes, so a duration, a size and a type came back on a file no player opens.
`exportClip` now reads one pixel before it starts recording and raises
`CORS_ERROR` instead.

Both halves of the remedy are needed:

```js
// The server:  Access-Control-Allow-Origin: https://your-app.example
await openVideo(editor, "https://cdn.example/clip.webm", { crossOrigin: "anonymous" });
```

## What is not here

No frame-accurate scrubbing beyond what the browser's own seeking gives, no
audio editing beyond the output level, no transitions, no speed changes, and no
joining two different sources — the parts a clip keeps all come from the one
film. The package is trimming and export; each of those is a product of
its own.

The playhead is the element's own: `openVideo` hands back the
`HTMLVideoElement`, so `element.currentTime` is the platform's property, clamped
by the browser and needing nothing from us. `clipTimeToSource` converts a moment
inside the clip to one in the source, which is the part the platform cannot
know.

## Where to read more

`docs/BROWSER-SUPPORT.md` (what degrades where) · `docs/PLUGINS.md` (the trim
strip is one, and the first customer of `addStrings`) · `docs/DOCUMENT-SCHEMA.md`
(the clip range as it is stored) · `docs/PUBLIC-API.md` (every exported name)
