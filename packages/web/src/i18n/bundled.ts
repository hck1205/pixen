import { ar } from "./ar.js";
import { de } from "./de.js";
import { es } from "./es.js";
import { fr } from "./fr.js";
import { registerLocale } from "./index.js";
import { ja } from "./ja.js";
import { ko } from "./ko.js";
import { pt } from "./pt.js";
import { zh } from "./zh.js";

/**
 * Every language Pixen ships, in one line.
 *
 * The way back to how the registry used to behave, for a host that would rather
 * have all of them than choose. Importing this module is what puts them in the
 * bundle — which is the point of it being a module of its own.
 */
export function registerBundledLocales(): void {
  for (const [tag, strings] of [
    ["ar", ar],
    ["de", de],
    ["es", es],
    ["fr", fr],
    ["ja", ja],
    ["ko", ko],
    ["pt", pt],
    ["zh", zh],
  ] as const) {
    registerLocale(tag, strings);
  }
}
