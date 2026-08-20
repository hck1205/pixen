# Testing

Four suites, each answering a different question.

| Command | Answers |
| --- | --- |
| `pnpm test` | Do the pure functions decide correctly? Also runs the four scans below |
| `pnpm test:browser` | Does the real bundle behave, in a real engine, driven by a real pointer? |
| `pnpm test:visual` | Does it still *look* the same? Opt-in; see below |
| `pnpm stories` | What does it look like now — for a person, not an assertion. Its *Coverage* story is the feature list, checked by `pnpm test` |

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

## The scans

Four checks run inside `pnpm test`, each turning a rule from the working
agreement into a failing test rather than a good intention:

| Scan | Fails on |
| --- | --- |
| `check:independence` | A third-party name, dependency or vendored code |
| `check:exports` | An export nothing imports |
| `check:duplication` | The same four meaningful lines in three places |
| `check:size` | A source file past 300 lines with no recorded reason, or an exemption the file has since shrunk well below |

### Why four lines, and why three copies

Both numbers were tuned by running the scan, not chosen in the abstract. At
three lines every finding is import boilerplate and closing tags; at five, the
clones this repository has actually shipped would have slipped through. Three
copies is the working agreement's own threshold — two similar pieces of code
can wait, and abstracting the first similarity is its own mistake.

Deliberate repetition goes in `ACCEPTED_DUPLICATION` with its reason. There are
two entries: the nine locale files, whose sameness is the point, and the story
files' shared title, which is what keeps a story's id stable when stories move
between files.

### The size budget is a tripwire, not a cap

Crossing 300 lines means one of two things has to happen: split the file, or
write down in `scripts/module-budget.mjs` why it is one concern that grew. The
point is not the number — it is that "this one is fine" stops being a private
judgement and becomes a recorded one the next reader can disagree with.

An exemption is pinned to the size it was written at, so a file that is exempt
still cannot grow without someone deciding again. It ratchets the other way too:
split an exempt file and the scan asks for the entry to come down to the new
size, give or take `EXEMPT_SLACK` lines of room for ordinary editing. Otherwise
every split quietly buys headroom to grow back into.

## The coverage page

`apps/stories/src/coverage/` lists every capability, what it is today, and
what proves it. It is not prose: where a capability is a set of things — tools,
formats, adjustment presets, locales — the description is generated from the
export that defines them, so deleting a preset deletes it from the page. The
evidence is structured data, and `tests/unit/coverage.test.ts` checks that every
unit test, browser spec, story and document named there exists.

That makes it the one place to look when asking "does Pixen do X?", and the
first place to update when the answer changes: a new capability without a row is
a capability nobody can find, and a row naming a test that was renamed away
fails the suite.

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

### CI installs a browser, not a package manager

The workflow runs `playwright install chromium` without `--with-deps`. That
flag runs `apt-get update` first, and on the runner the Ubuntu mirror has twice
stopped answering mid-fetch — the job sat silent until the timeout killed it,
which is reported as "cancelled" and reads as though a person did it.

What it was installing was fonts: CJK, Thai and Cyrillic sets. The shared
objects Chromium needs are already in the image, which is why runs that got
past apt were green. Fonts change glyph rasterisation, so they matter to golden
images — and the suite that takes those is opt-in and never runs in CI, which
is what makes dropping them safe here rather than merely convenient. Anyone
recording baselines is doing it on their own machine with their own fonts.

The step is bounded by `timeout-minutes` so a stalled download fails in minutes,
by name, instead of consuming the job's whole budget.

### Each suite starts only the servers it uses

The browser suite drives the playground on 4173. The visual suite photographs
the story browser on 4174, so that second server starts **only** when
`PIXEN_VISUAL` is set.

That is not tidiness. A web server Playwright is configured to start is a
precondition of the whole run, whether or not a test opens it: while the story
browser started unconditionally, a runner that was slow to bring it up failed a
browser suite that never touches port 4174 — and every CI run after it was added
was red for a reason that had nothing to do with the code under test.

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
