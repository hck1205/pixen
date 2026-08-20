/**
 * The snippet the playground exists to hand over.
 *
 * "Edit an image, then copy the configuration that produces what you set up" is
 * the whole promise of this page, so the snippet is the deliverable — and a
 * snippet that does not actually reproduce what is on screen is worse than no
 * snippet at all. Building it here as a pure function is what lets a test check
 * that, instead of it being a string assembled inside a DOM write.
 */
export interface PlaygroundSettings {
  theme: string;
  locale: string;
  /** Empty means "match the source", which is the element's own default. */
  format: string;
  quality: string;
  /** Empty means no preset. */
  preset: string;
}

/** The locale the element assumes, and so the one worth leaving out. */
const DEFAULT_LOCALE = "en";
/** What the headless example encodes to when the picker is on "match source". */
const FALLBACK_FORMAT = "image/webp";
/** The square a profile picture is cropped to in the headless example. */
const PROFILE_EDGE = 1024;
/** What every other preset caps its longest edge at. */
const MAX_EDGE = 1600;

export function configSnippet(settings: PlaygroundSettings): string {
  return [...elementLines(settings), "", "// or headless, no UI at all:", ...headlessLines(settings)].join("\n");
}

/**
 * Only what differs from the defaults, because a snippet that repeats them
 * teaches the reader that they have to be written.
 */
function elementLines(settings: PlaygroundSettings): string[] {
  const lines = ["<pixen-image-editor", `  src="/photo.jpg"`, `  theme="${settings.theme}"`];
  if (settings.locale !== DEFAULT_LOCALE) lines.push(`  locale="${settings.locale}"`);
  if (settings.format) lines.push(`  format="${settings.format}"`);
  lines.push(`  quality="${settings.quality}"`);
  if (settings.preset) lines.push(`  preset="${settings.preset}"`);
  lines.push("></pixen-image-editor>");
  return lines;
}

function headlessLines(settings: PlaygroundSettings): string[] {
  const size =
    settings.preset === "profile"
      ? [`  width: ${PROFILE_EDGE},`, `  height: ${PROFILE_EDGE},`]
      : [`  maxWidth: ${MAX_EDGE},`];
  return [
    "const result = await processImage(file, {",
    ...size,
    `  format: "${settings.format || FALLBACK_FORMAT}",`,
    `  quality: ${settings.quality},`,
    "});",
  ];
}
