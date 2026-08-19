import { controls } from "./controls.js";
import { layout } from "./layout.js";
import { panels } from "./panels.js";
import { responsive } from "./responsive.js";
import { tokens } from "./tokens.js";

/**
 * Pixen's UI language, deliberately its own: a floating vertical tool rail, a
 * contextual inspector docked to the bottom of the canvas, and a quiet action
 * cluster in the corner. On narrow screens the inspector becomes a sheet and
 * the rail lies down along the bottom edge.
 *
 * Customisation is layered: CSS custom properties for colour and shape,
 * `::part` for structural tweaks, and named slots for replacing controls
 * outright.
 *
 * The sheet is assembled in cascade order — tokens, then where things go, then
 * what they look like, then the panels that come and go, then the compact
 * layout that overrides the lot. Splitting it up is not filing: a rule's
 * neighbours are now the rules it belongs with, which is how the duplicated
 * text-editor block hiding inside two media queries was found.
 */
export const styles = [tokens, layout, controls, panels, responsive].join("\n");
