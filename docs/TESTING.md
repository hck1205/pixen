# Testing

Four suites, each answering a different question.

| Command | Answers |
| --- | --- |
| `pnpm test` | Do the pure functions decide correctly? Also runs the independence and unused-export scans |
| `pnpm test:browser` | Does the real bundle behave, in a real engine, driven by a real pointer? |
| `pnpm test:visual` | Does it still *look* the same? Opt-in; see below |
| `pnpm stories` | What does it look like now — for a person, not an assertion |

## Unit tests

`vitest`, no DOM. That is deliberate: everything that decides something is a
pure function over data, so a decision that needs a browser to be tested is a
decision in the wrong place. Anything genuinely about layout or rendering
belongs in the browser suite instead.

## Browser tests

Playwright against the **built playground** — the same bundle a customer would
integrate. `test:browser` builds the packages and the playground first, so the
suite can never run against a stale bundle.

These cover what only a real engine can answer: canvas output, pointer gestures,
encoders, workers, and layout. The rule of thumb is the one in `CLAUDE.md` — the
layout bugs this project has actually shipped were invisible to unit tests.

## Visual regression

```bash
pnpm test:visual          # compare against the committed baselines
pnpm test:visual:update   # re-record them after an intended change
```

Golden images over the story browser, because the stories are already the
reference for what the UI should look like.

**It is opt-in, and CI does not run it.** A baseline is only as portable as the
renderer that recorded it: font rasterisation and antialiasing differ between
machines, so baselines recorded here would be a red build on someone else's.
Run it in the same environment the baselines came from, and re-record when a
change to the interface is intentional — the diff images Playwright writes to
`test-results/` are the review.

The tolerance is deliberately tight (`maxDiffPixelRatio: 0.0005`). A looser one
passed a build with the accent colour changed from blue to pink, because the
accent covers well under one per cent of the page. A threshold that forgiving
forgives regressions.

### Preview servers are never reused

Both suites start their own preview server and refuse to reuse a running one.
`ladle preview` resolves the build once at startup, so a server left over from
an earlier run serves the *previous* bundle — and a suite photographing a stale
build passes no matter what the change did. This was not hypothetical: the first
set of baselines in this repository was recorded against a stale server and had
to be thrown away.

If a run fails with `port is already used`, something else is holding 4173 or
4174. That failure is the intended behaviour; stop the other server rather than
turning reuse back on.
