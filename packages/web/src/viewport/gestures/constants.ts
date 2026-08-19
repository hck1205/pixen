/**
 * The numbers that decide how a gesture feels.
 *
 * Internal to this folder: they are tuning, not API, and a host that wants a
 * different feel changes the behaviour rather than the constant.
 */
export const HANDLE_HIT_RADIUS = 14;
/** Layer handles sit inside a smaller radius, so they beat the layer body to a grab. */
export const LAYER_HANDLE_HIT_RADIUS = 12;
/** Smallest a layer may be dragged to, as a fraction of the image. */
export const MIN_LAYER_SIZE_RATIO = 0.01;
/** A shape smaller than this fraction of the image is treated as a stray tap. */
export const DEGENERATE_RATIO = 0.004;
/** Free-draw samples closer than this fraction of the image are dropped. */
export const PATH_SAMPLE_RATIO = 0.002;
/** Layers are grabbable slightly outside their bounds, so thin shapes are usable. */
export const LAYER_HIT_TOLERANCE_RATIO = 0.01;
/** Wheel zoom sensitivity; a trackpad pinch arrives as ctrl + wheel. */
export const WHEEL_ZOOM_INTENSITY = 0.0022;
export const PINCH_ZOOM_INTENSITY = 0.01;

/** Smallest crop a drag may produce, in image pixels, unless a host says otherwise. */
export const DEFAULT_MIN_CROP_SIZE = 24;
/** The floor a host cannot go below: a crop smaller than this cannot be grabbed. */
export const ABSOLUTE_MIN_CROP_SIZE = 4;
