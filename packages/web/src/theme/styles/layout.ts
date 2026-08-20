/**
 * Where the pieces go: the canvas, the layer that floats over it, and the three
 * rows the chrome is arranged into.
 *
 * Nothing here is about how a control *looks* — only about what occupies which
 * part of the box, and which parts take pointer events.
 */
export const layout = `
/* Disabled: still there, still legible, no longer listening. A host waiting on
   a round trip needs the picture on screen and the controls inert. Blocking
   pointer events at the host covers the canvas and every control at once;
   aria-disabled on the host says the same thing out loud. */
:host([disabled]) .root {
  pointer-events: none;
  opacity: 0.55;
  filter: saturate(0.6);
}

.root {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  background: var(--pixen-surface-sunken);
}

/* Absolutely positioned on purpose: a canvas carries an intrinsic size from its
   width/height attributes, and those track the device pixel ratio. In a grid or
   flow layout that intrinsic size feeds back into the row height, so the canvas
   grows past its container, the fit zoom is computed against the wrong height,
   and the bottom of the chrome is clipped away. Taking it out of flow makes the
   host's box the only thing that decides the size. */
canvas {
  position: absolute;
  inset: 0;
  display: block;
  inline-size: 100%;
  block-size: 100%;
  touch-action: none;
}

.layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: grid;
  /* minmax(0, 1fr): an auto grid track sizes to max-content, so a rail wider
     than the host would widen the track instead of scrolling inside it. */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr auto;
  padding: 12px;
  gap: 12px;
}

/* The layout rows span the whole canvas, so only the floating chrome itself may
   take pointer events — otherwise an invisible row swallows every drag. */
.layer > * { pointer-events: none; }
.cluster, .empty, ::slotted(*) { pointer-events: auto; }

.top {
  display: flex;
  /* Wraps rather than overlapping: the status message and the actions share
     this row, and on a narrow host there is not width for both. */
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: flex-start;
  gap: var(--pixen-gap);
}

.middle {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-block-size: 0;
}

.bottom {
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.cluster {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px;
  background: var(--pixen-surface-raised);
  border: 1px solid var(--pixen-border);
  border-radius: var(--pixen-radius);
  box-shadow: var(--pixen-shadow);
  /* Prefixed first: Safari carried -webkit-backdrop-filter for years before the
     unprefixed property, and the chrome is legible either way. */
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.rail {
  flex-direction: column;
  /* Never spill out of a short host. Wrapping into a second column comes first,
     because a scrolled rail hides controls with no hint that it has — which is
     exactly how the panel buttons disappeared when the layer list made the
     inspector taller. Scrolling stays as the last resort. */
  max-block-size: 100%;
  flex-wrap: wrap;
  overflow: auto;
  scrollbar-width: none;
}

.rail::-webkit-scrollbar { display: none; }

/* Where one group of rail buttons ends and the next begins. */
.rail .group-start { margin-block-start: 8px; }
`;
