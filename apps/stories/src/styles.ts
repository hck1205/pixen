import type { CSSProperties } from "react";

/**
 * One visual vocabulary for the stories.
 *
 * The story files kept growing their own copies of the same button, the same
 * code block, the same caption — which made a restyle a search-and-replace and
 * made the stories look subtly different from each other. They share these.
 */
export const panelTitle: CSSProperties = {
  margin: 0,
  font: "600 13px/1.4 system-ui, sans-serif",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  opacity: 0.7,
};

export const note: CSSProperties = {
  margin: 0,
  font: "400 13px/1.5 system-ui, sans-serif",
  opacity: 0.65,
  maxWidth: "70ch",
};

export const hostButton: CSSProperties = {
  font: "600 13px/1 system-ui, sans-serif",
  color: "inherit",
  background: "rgba(127, 140, 170, 0.16)",
  border: "1px solid rgba(127, 140, 170, 0.28)",
  borderRadius: 8,
  padding: "9px 12px",
  cursor: "pointer",
};

/** The host's own primary action, for the slot-override story. */
export const hostPrimaryButton: CSSProperties = {
  ...hostButton,
  background: "#12a594",
  color: "#04120f",
  border: 0,
};

export const codeBlock: CSSProperties = {
  margin: 0,
  maxHeight: 420,
  overflow: "auto",
  padding: 12,
  borderRadius: 10,
  background: "rgba(127, 140, 170, 0.12)",
  font: "400 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
  maxWidth: "100%",
};

export const logList: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: 4,
  maxHeight: 420,
  overflow: "auto",
  font: "400 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
};

export const statRow: CSSProperties = {
  margin: 0,
  display: "flex",
  gap: 18,
  font: "400 12px/1.4 system-ui, sans-serif",
  opacity: 0.8,
};

export const specimenGrid: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  font: "400 12px/1.4 system-ui, sans-serif",
};

export const specimenCell: CSSProperties = {
  margin: 0,
  display: "grid",
  gap: 8,
  justifyItems: "center",
  padding: 14,
  borderRadius: 12,
  border: "1px solid rgba(127, 140, 170, 0.25)",
};

export const specimenCaption: CSSProperties = {
  opacity: 0.7,
  textAlign: "center",
  wordBreak: "break-all",
};

export const table: CSSProperties = {
  borderCollapse: "collapse",
  font: "400 13px/1.5 system-ui, sans-serif",
  width: "100%",
  maxWidth: 860,
};

export const tableHeader: CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "1px solid rgba(127, 140, 170, 0.35)",
  opacity: 0.7,
  font: "600 12px/1.4 system-ui, sans-serif",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

export const tableCell: CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid rgba(127, 140, 170, 0.18)",
};
