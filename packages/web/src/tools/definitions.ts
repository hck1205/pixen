import type { ToolDefinition, ToolId } from "./types.js";

/** The full tool set, in the order the rail presents it. */
export const DEFAULT_TOOLS: ToolDefinition[] = [
  { id: "crop" },
  { id: "select" },
  { id: "rect" },
  { id: "ellipse" },
  { id: "arrow" },
  { id: "draw" },
  { id: "text" },
  { id: "sticker" },
  { id: "redact" },
];

/** Normalises the `tools` property, which hosts may pass as ids or objects. */
export function normaliseTools(input: unknown): ToolDefinition[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_TOOLS;
  const tools: ToolDefinition[] = [];
  for (const entry of input) {
    if (typeof entry === "string") {
      tools.push({ id: entry as ToolId });
    } else if (entry && typeof entry === "object" && "type" in entry) {
      const record = entry as { type: ToolId; options?: Record<string, unknown> };
      tools.push({ id: record.type, ...(record.options ? { options: record.options } : {}) });
    } else if (entry && typeof entry === "object" && "id" in entry) {
      tools.push(entry as ToolDefinition);
    }
  }
  return tools.length > 0 ? tools : DEFAULT_TOOLS;
}
