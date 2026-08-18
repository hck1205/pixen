export interface PixenStrings {
  crop: string;
  select: string;
  rectangle: string;
  ellipse: string;
  arrow: string;
  draw: string;
  text: string;
  redact: string;
  rotateLeft: string;
  rotateRight: string;
  flipHorizontal: string;
  flipVertical: string;
  undo: string;
  redo: string;
  reset: string;
  export: string;
  exporting: string;
  freeform: string;
  original: string;
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
  zoomLevel: string;
  adjustments: string;
}

export const en: PixenStrings = {
  crop: "Crop",
  select: "Select",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  arrow: "Arrow",
  draw: "Draw",
  text: "Text",
  redact: "Redact",
  rotateLeft: "Rotate left",
  rotateRight: "Rotate right",
  flipHorizontal: "Flip horizontal",
  flipVertical: "Flip vertical",
  undo: "Undo",
  redo: "Redo",
  reset: "Reset",
  export: "Export",
  exporting: "Exporting…",
  freeform: "Freeform",
  original: "Original",
  aspectRatio: "Aspect ratio",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomFit: "Fit to view",
  brightness: "Brightness",
  contrast: "Contrast",
  saturation: "Saturation",
  strokeColour: "Colour",
  strokeWidth: "Width",
  delete: "Delete",
  dropHint: "Drop an image to edit",
  emptyTitle: "No image loaded",
  emptyBody: "Drop a file here, paste from the clipboard, or choose one.",
  choose: "Choose image",
  textPlaceholder: "Type here",
  toolbarTools: "Tools",
  toolbarActions: "Actions",
  toolbarOptions: "Options",
  zoomLevel: "Zoom",
  adjustments: "Adjustments",
};

export const ko: PixenStrings = {
  crop: "자르기",
  select: "선택",
  rectangle: "사각형",
  ellipse: "원",
  arrow: "화살표",
  draw: "그리기",
  text: "텍스트",
  redact: "가리기",
  rotateLeft: "왼쪽으로 회전",
  rotateRight: "오른쪽으로 회전",
  flipHorizontal: "좌우 반전",
  flipVertical: "상하 반전",
  undo: "실행 취소",
  redo: "다시 실행",
  reset: "초기화",
  export: "내보내기",
  exporting: "내보내는 중…",
  freeform: "자유 비율",
  original: "원본 비율",
  aspectRatio: "비율",
  zoomIn: "확대",
  zoomOut: "축소",
  zoomFit: "화면에 맞추기",
  brightness: "밝기",
  contrast: "대비",
  saturation: "채도",
  strokeColour: "색상",
  strokeWidth: "굵기",
  delete: "삭제",
  dropHint: "이미지를 놓아 편집",
  emptyTitle: "이미지가 없습니다",
  emptyBody: "파일을 끌어다 놓거나 붙여넣거나 선택하세요.",
  choose: "이미지 선택",
  textPlaceholder: "내용 입력",
  toolbarTools: "도구",
  toolbarActions: "작업",
  toolbarOptions: "옵션",
  zoomLevel: "확대",
  adjustments: "색 보정",
};

const locales = new Map<string, PixenStrings>([
  ["en", en],
  ["ko", ko],
]);

/** Registers or replaces a locale. Hosts can ship their own without a rebuild. */
export function registerLocale(locale: string, strings: Partial<PixenStrings>): void {
  locales.set(locale, { ...en, ...strings });
}

export function resolveStrings(locale: string | null | undefined): PixenStrings {
  if (!locale) return en;
  return locales.get(locale) ?? locales.get(locale.split("-")[0] ?? "") ?? en;
}
