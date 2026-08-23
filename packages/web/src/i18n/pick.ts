/**
 * Which table answers for a locale tag.
 *
 * Two things ask this now — the editor's own strings, and a plugin's — and they
 * have to answer the same way, or a plugin shipped for `ko` would be English
 * beside a Korean interface for `ko-KR`. It is a pure lookup over whatever
 * tables the caller has, rather than a second copy of the rule.
 */

/** The base language of a tag: `ko-KR` is `ko`, and `zh-Hans-CN` is `zh`. */
export function baseLanguage(locale: string): string {
  return locale.split("-")[0]?.toLowerCase() ?? "";
}

/**
 * The exact tag, else its base language, else nothing.
 *
 * Nothing rather than a fallback, because what to fall back *to* differs: the
 * editor completes every locale from English at registration, and a plugin
 * carries its own English table.
 */
export function pickLocale<T>(tables: ReadonlyMap<string, T>, locale: string | null | undefined): T | undefined {
  if (!locale) return undefined;
  return tables.get(locale) ?? tables.get(baseLanguage(locale));
}
