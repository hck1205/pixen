/**
 * The trim strip's own labels, in the nine languages the editor ships.
 *
 * They live here rather than in the editor's table because this package is sold
 * separately: its keys are its own, and a host that never buys it never carries
 * them. `PluginContext.addStrings` is the seam that makes that possible.
 */
export const TRIM_STRINGS = {
  en: { trim: "Trim", start: "Start", end: "End", whole: "Whole clip", keep: "Keep", cut: "Cut out", play: "Play", pause: "Pause", mute: "Mute", unmute: "Sound on" },
  ko: { trim: "자르기", start: "시작", end: "끝", whole: "전체 클립", keep: "이 부분만", cut: "이 부분 삭제", play: "재생", pause: "일시정지", mute: "음소거", unmute: "소리 켜기" },
  ja: { trim: "トリム", start: "開始", end: "終了", whole: "クリップ全体", keep: "ここだけ残す", cut: "ここを削除", play: "再生", pause: "一時停止", mute: "ミュート", unmute: "ミュート解除" },
  zh: { trim: "裁剪", start: "开始", end: "结束", whole: "整段", keep: "只保留这段", cut: "删除这段", play: "播放", pause: "暂停", mute: "静音", unmute: "取消静音" },
  de: { trim: "Zuschneiden", start: "Anfang", end: "Ende", whole: "Ganzer Clip", keep: "Nur dies", cut: "Herausschneiden", play: "Abspielen", pause: "Pause", mute: "Stumm", unmute: "Ton an" },
  fr: { trim: "Rogner", start: "Début", end: "Fin", whole: "Clip entier", keep: "Garder", cut: "Couper", play: "Lire", pause: "Pause", mute: "Muet", unmute: "Son" },
  es: { trim: "Recortar", start: "Inicio", end: "Fin", whole: "Clip completo", keep: "Solo esto", cut: "Quitar", play: "Reproducir", pause: "Pausa", mute: "Silenciar", unmute: "Con sonido" },
  pt: { trim: "Cortar", start: "Início", end: "Fim", whole: "Clipe inteiro", keep: "Só isto", cut: "Remover", play: "Reproduzir", pause: "Pausar", mute: "Sem som", unmute: "Com som" },
  ar: { trim: "اقتصاص", start: "البداية", end: "النهاية", whole: "المقطع كامل", keep: "الإبقاء على هذا", cut: "قص هذا", play: "تشغيل", pause: "إيقاف مؤقت", mute: "كتم", unmute: "تشغيل الصوت" },
} as const;
