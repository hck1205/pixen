import type { EdgeBox } from "../../viewport/index.js";

/** Only the `.cluster` boxes are chrome the picture has to fit around. */
const CHROME_SELECTOR = ".cluster";

/**
 * Where the picture may go, and what is currently in the way.
 *
 * Read from the live DOM rather than assumed. The inspector's height depends on
 * which panel is open and how many rows its controls wrapped onto, and a
 * hard-coded guess is how the picture ends up underneath the toolbar on a narrow
 * host — a layout bug no unit test can see.
 *
 * A cluster that is hidden takes up no space and is left out. `offsetParent` is
 * the cheap test for that and is checked first; it is also `null` for a
 * `position: fixed` element that *is* visible, which is what the second test is
 * for.
 */
export function measureChrome(canvas: Element, root: ParentNode): { host: EdgeBox; chrome: EdgeBox[] } {
  return {
    host: canvas.getBoundingClientRect(),
    chrome: [...root.querySelectorAll<HTMLElement>(CHROME_SELECTOR)]
      .filter((node) => node.offsetParent !== null || node.getClientRects().length > 0)
      .map((node) => node.getBoundingClientRect()),
  };
}
