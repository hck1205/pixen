export interface PixenStrings {
  crop: string;
  select: string;
  rectangle: string;
  ellipse: string;
  arrow: string;
  draw: string;
  text: string;
  redact: string;
  retouch: string;
  rotateLeft: string;
  rotateRight: string;
  flipHorizontal: string;
  flipVertical: string;
  undo: string;
  redo: string;
  reset: string;
  export: string;
  exporting: string;
  loading: string;
  freeform: string;
  aspectRatio: string;
  zoomIn: string;
  zoomOut: string;
  zoomFit: string;
  brightness: string;
  contrast: string;
  saturation: string;
  strokeColour: string;
  strokeWidth: string;
  delete: string;
  dropHint: string;
  emptyTitle: string;
  emptyBody: string;
  choose: string;
  textPlaceholder: string;
  toolbarTools: string;
  toolbarActions: string;
  toolbarOptions: string;
  adjustments: string;
  redactSolid: string;
  redactBlur: string;
  redactPixelate: string;
  redactScramble: string;
  redactStrength: string;
  opacity: string;
  rotation: string;
  exposure: string;
  hue: string;
  grayscale: string;
  sepia: string;
  invert: string;
  vignette: string;
  gamma: string;
  temperature: string;
  tint: string;
  presets: string;
  straighten: string;
  sticker: string;
  stickerHint: string;
  frame: string;
  frameNone: string;
  frameSolid: string;
  frameInset: string;
  frameRounded: string;
  frameHook: string;
  frameLine: string;
  frameEdge: string;
  frameInsetAmount: string;
  frameOffset: string;
  frameArm: string;
  frameCount: string;
  frameRadius: string;
  frameWidth: string;
  frameColour: string;
  canvas: string;
  layers: string;
  layersEmpty: string;
  layerHide: string;
  layerShow: string;
  layerLock: string;
  layerUnlock: string;
  layerUp: string;
  layerDown: string;
  fillColour: string;
  fillNone: string;
  dash: string;
  corner: string;
  fontSize: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  textPlate: string;
  /** What sits at each end of a line, and the eight it may be. */
  lineStart: string;
  lineEnd: string;
  endNone: string;
  endBar: string;
  endArrow: string;
  endArrowSolid: string;
  endCircle: string;
  endCircleSolid: string;
  endSquare: string;
  endSquareSolid: string;
  output: string;
  outputWidth: string;
  outputHeight: string;
  linkRatio: string;
  formatAuto: string;
  quality: string;
  background: string;
  backgroundNone: string;
  sizeNatural: string;
  /** The output size may exceed the picture. See `OutputSettings.upscale`. */
  allowUpscale: string;

  /**
   * The names of the steps the engine can undo, one per `StepName`.
   *
   * An undo button that says what it will undo is the difference between a
   * guess and a decision — and it was making that difference in English in
   * every language, because the verb came from here and the step did not. A
   * label a host worded itself is not in this list and is shown as given.
   */
  /**
   * What sits between "Undo" and the step it will undo.
   *
   * A locale string because it is one: French puts a space before a colon and
   * the others do not, so hard-coding `": "` was correct in eight languages and
   * wrong in the ninth.
   */
  stepSeparator: string;
  stepRotate: string;
  stepStraighten: string;
  stepFlipHorizontal: string;
  stepFlipVertical: string;
  stepCrop: string;
  stepResetCrop: string;
  stepMoveCrop: string;
  stepTrim: string;
  stepResetTrim: string;
  stepAspectRatio: string;
  stepCropArea: string;
  stepAdjust: string;
  stepColourMatrix: string;
  stepOutput: string;
  stepFrame: string;
  stepResize: string;
  stepAddLayer: string;
  stepRetouch: string;
  stepEditLayer: string;
  stepMoveLayer: string;
  stepMoveLayerHandle: string;
  stepRotateLayer: string;
  stepReorderLayer: string;
  stepDeleteLayer: string;
  stepReset: string;
  stepReplaceDocument: string;
  stepReplaceImage: string;
  stepApplyEdits: string;
}
