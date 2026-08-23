# Video

`@pixen/video` is sold and shipped separately. Read this before choosing it:
two of its costs are large, both were measured rather than assumed, and neither
is a footnote.

The editor does not become a video editor. A video is registered as the source
like any other picture, and every existing feature reaches every frame through
the scene that was already there. What the package adds is the two things that
are genuinely about time — which part is kept, and how it is written out.

```js
import { openVideo, exportClip, trimPlugin } from "@pixen/video";

editor.use(trimPlugin);                       // the trim strip in the inspector
const { element, duration } = await openVideo(editor, file);
const clip = await exportClip(editor.document, element, editor.resources);
```

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

## What applies to a moving picture

Everything in the first column goes through the same `createScene` and
`renderScene` the still export uses, so it lands on every frame without knowing
the picture moves.

| Reaches every frame | Time only | Still pictures only |
| --- | --- | --- |
| Crop and aspect ratio | The clip range | EXIF carried from the source |
| Rotation, flip, straighten | The trim strip | `quality` and `maxBytes` |
| All adjustments and presets | | `maxPixels` |
| Frames and vignette | | `exportVariants`, `processImages` |
| Every annotation, including redaction | | The preview proxy |

Two of those deserve their own line:

- **There is no preview proxy.** A resource with a duration is never downscaled
  into a stand-in bitmap, so `previewMaxSize` does nothing and the viewport is
  always drawing the real thing.
- **`bitrate` replaces `quality`.** A recording has no re-encode loop to fit a
  byte budget, so `maxBytes` has no equivalent — ask for a bitrate instead.

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
audio editing, no concatenation, no transitions, no speed changes. The package
is trimming and export; each of those is a product of its own.

## Where to read more

`docs/BROWSER-SUPPORT.md` (what degrades where) · `docs/PLUGINS.md` (the trim
strip is one, and the first customer of `addStrings`) · `docs/DOCUMENT-SCHEMA.md`
(the clip range as it is stored) · `docs/PUBLIC-API.md` (every exported name)
