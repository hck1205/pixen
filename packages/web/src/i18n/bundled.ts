import { ar } from "./ar.js";
import { de } from "./de.js";
import { es } from "./es.js";
import { fr } from "./fr.js";
import { hi } from "./hi.js";
import { registerLocale } from "./index.js";
import { it } from "./it.js";
import { ja } from "./ja.js";
import { ko } from "./ko.js";
import { nb } from "./nb.js";
import { nl } from "./nl.js";
import { pt } from "./pt.js";
import { ru } from "./ru.js";
import { sv } from "./sv.js";
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
    ["hi", hi],
    ["it", it],
    ["ja", ja],
    ["ko", ko],
    ["nb", nb],
    ["nl", nl],
    ["pt", pt],
    ["ru", ru],
    ["sv", sv],
    ["zh", zh],
  ] as const) {
    registerLocale(tag, strings);
  }
}
