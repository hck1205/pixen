import { icons } from "../../theme/index.js";
import { element, fragmentFromHTML, textButton } from "../dom/index.js";
import type { ChromeContext } from "./context.js";

/**
 * What the editor shows before an image arrives.
 *
 * It names all three ways in: drop, paste, or pick — because an empty canvas
 * with no instructions is a dead end.
 */
export function buildEmptyState(context: ChromeContext): Node[] {
  const { strings, actions } = context;

  return [
    fragmentFromHTML(icons.image),
    element("h2", { text: strings.emptyTitle }),
    element("p", { text: strings.emptyBody }),
    textButton({ text: strings.choose, onClick: actions.chooseFile }),
  ];
}
