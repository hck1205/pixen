/**
 * The trim strip's own labels, in the nine languages the editor ships.
 *
 * They live here rather than in the editor's table because this package is sold
 * separately: its keys are its own, and a host that never buys it never carries
 * them. `PluginContext.addStrings` is the seam that makes that possible.
 */
export const TRIM_STRINGS = {
  en: { trim: "Trim", start: "Start", end: "End", whole: "Whole clip" },
  ko: { trim: "자르기", start: "시작", end: "끝", whole: "전체 클립" },
  ja: { trim: "トリム", start: "開始", end: "終了", whole: "クリップ全体" },
  zh: { trim: "裁剪", start: "开始", end: "结束", whole: "整段" },
  de: { trim: "Zuschneiden", start: "Anfang", end: "Ende", whole: "Ganzer Clip" },
  fr: { trim: "Rogner", start: "Début", end: "Fin", whole: "Clip entier" },
  es: { trim: "Recortar", start: "Inicio", end: "Fin", whole: "Clip completo" },
  pt: { trim: "Cortar", start: "Início", end: "Fim", whole: "Clipe inteiro" },
  ar: { trim: "اقتصاص", start: "البداية", end: "النهاية", whole: "المقطع كامل" },
} as const;
