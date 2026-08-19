/**
 * Pixen's own icon set: single-weight 24x24 strokes drawn from primitives, so
 * the product carries no third-party icon licence and no borrowed visual style.
 */
const wrap = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  crop: wrap('<path d="M7 3v14h14"/><path d="M3 7h14v14"/>'),
  select: wrap('<path d="M5 4l6 15 2.2-5.8L19 11z"/>'),
  rectangle: wrap('<rect x="4" y="6" width="16" height="12" rx="1.5"/>'),
  ellipse: wrap('<ellipse cx="12" cy="12" rx="8" ry="6"/>'),
  arrow: wrap('<path d="M5 19L19 5"/><path d="M11 5h8v8"/>'),
  draw: wrap('<path d="M4 19c3-1 4-7 7-7s2 4 4 4 3-3 5-8"/>'),
  text: wrap('<path d="M6 6h12"/><path d="M12 6v13"/><path d="M9 19h6"/>'),
  redact: wrap('<rect x="4" y="9" width="16" height="6" rx="1"/><path d="M8 5v2M16 17v2"/>'),
  rotateLeft: wrap('<path d="M4 9h7a6 6 0 110 12H7"/><path d="M4 9l3-3M4 9l3 3"/>'),
  rotateRight: wrap('<path d="M20 9h-7a6 6 0 100 12h4"/><path d="M20 9l-3-3M20 9l-3 3"/>'),
  flipHorizontal: wrap('<path d="M12 3v18"/><path d="M9 7L4 12l5 5z"/><path d="M15 7l5 5-5 5z"/>'),
  flipVertical: wrap('<path d="M3 12h18"/><path d="M7 9l5-5 5 5z"/><path d="M7 15l5 5 5-5z"/>'),
  undo: wrap('<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12"/>'),
  redo: wrap('<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 000 12"/>'),
  reset: wrap('<path d="M5 12a7 7 0 107-7"/><path d="M12 2v6h-6"/>'),
  download: wrap('<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/>'),
  zoomIn: wrap('<circle cx="11" cy="11" r="6"/><path d="M11 9v4M9 11h4"/><path d="M16 16l4 4"/>'),
  zoomOut: wrap('<circle cx="11" cy="11" r="6"/><path d="M9 11h4"/><path d="M16 16l4 4"/>'),
  fit: wrap('<path d="M4 9V4h5"/><path d="M20 15v5h-5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/>'),
  trash: wrap('<path d="M5 7h14"/><path d="M9 7V5h6v2"/><path d="M7 7l1 12h8l1-12"/>'),
  image: wrap('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l5-4 4 3 3-2 2 2"/>'),
  tune: wrap('<path d="M5 8h9M17 8h2"/><path d="M5 16h3M11 16h8"/><circle cx="15.5" cy="8" r="2"/><circle cx="9.5" cy="16" r="2"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
} as const;

export type IconName = keyof typeof icons;
