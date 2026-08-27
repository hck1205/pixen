# Third-party licences

## Runtime

The published packages — `@pixen/core`, `@pixen/web`, `@pixen/react` — have **no
third-party runtime dependencies**. They depend only on each other and on
standard browser APIs. `@pixen/react` declares `react` as a peer dependency,
which the host application already provides.

Icons, styles and copy in this repository are original work.

## Development and test tooling

Not distributed with the packages; listed for completeness.

| Package | Licence | Used for |
| --- | --- | --- |
| typescript | Apache-2.0 | compiler |
| vitest | MIT | unit tests |
| @playwright/test | Apache-2.0 | browser tests |
| vite | MIT | playground and stories dev server and build |
| esbuild | MIT | the single-file build for pages with no bundler |
| @ladle/react | MIT | story browser for visual UI review |
| react-dom | MIT | rendering the stories |
| @types/node, @types/react | MIT | type definitions |
| react | MIT | React wrapper development and typing |
| vue | MIT | Vue wrapper development and typing |

Regenerate this table when dependencies change; automating it (licence scan plus
SBOM in CI) is on the pre-release checklist.
