/**
 * The numbers that decide how a gesture feels.
 *
 * Internal to this folder: they are tuning, not API, and a host that wants a
 * different feel changes the behaviour rather than the constant.
 */
export const HANDLE_HIT_RADIUS = 14;
/** A shape smaller than this fraction of the image is treated as a stray tap. */
export const DEGENERATE_RATIO = 0.004;
/** Free-draw samples closer than this fraction of the image are dropped. */
export const PATH_SAMPLE_RATIO = 0.002;
/** Layers are grabbable slightly outside their bounds, so thin shapes are usable. */
export const LAYER_HIT_TOLERANCE_RATIO = 0.01;
/** Wheel zoom sensitivity; a trackpad pinch arrives as ctrl + wheel. */
export const WHEEL_ZOOM_INTENSITY = 0.0022;
export const PINCH_ZOOM_INTENSITY = 0.01;
