import { button, setPressed } from "../dom/index.js";
import { TOOL_META } from "../tool-meta.js";
import { railPanelState, railToolState } from "./availability.js";
import type { ChromeContext } from "./context.js";

/**
 * The tool rail: the editor's only persistent navigation.
 *
 * Tools are rendered from the host's `tools` list, so a host that ships three
 * tools gets three buttons rather than eight and a stylesheet.
 */
export function buildRail(context: ChromeContext): Node[] {
  const { strings, actions } = context;

  const toolButtons = context.tools.flatMap((tool) => {
    const meta = TOOL_META[tool.id];
    if (!meta) return [];
    return [
      button({
        icon: meta.icon,
        label: `${strings[meta.key]} (${meta.shortcut.toUpperCase()})`,
        keyShortcuts: meta.shortcut,
        dataset: { tool: tool.id },
        onClick: () => {
          actions.selectTool(tool.id);
          actions.announce(strings[meta.key]);
        },
      }),
    ];
  });

  // A gap rather than a rule between the tools and the panels: the rail wraps
  // into a second column on a short host, and a rule that lands at a column
  // break separates nothing while looking as though it separates something.
  return [
    ...toolButtons,
    button({
      icon: "tune",
      label: strings.adjustments,
      className: "group-start",
      dataset: { panel: "adjust" },
      onClick: () => actions.togglePanel("adjust"),
    }),
    button({
      icon: "layers",
      label: strings.layers,
      dataset: { panel: "layers" },
      onClick: () => actions.togglePanel("layers"),
    }),
    button({
      icon: "output",
      label: strings.output,
      dataset: { panel: "output" },
      onClick: () => actions.togglePanel("output"),
    }),
  ];
}

/** Pressed and disabled states, written onto the existing buttons. */
export function refreshRail(host: HTMLElement, context: ChromeContext): void {
  // See `railToolState`: the pressed rule is a decision, and it is made there.
  const conditions = { ready: context.editor.ready, panel: context.panel, tool: context.tool };

  for (const control of host.querySelectorAll<HTMLButtonElement>("button[data-tool]")) {
    const state = railToolState(conditions, control.dataset.tool ?? "");
    control.disabled = state.disabled;
    setPressed(control, state.pressed);
  }

  for (const panel of host.querySelectorAll<HTMLButtonElement>("button[data-panel]")) {
    const state = railPanelState(conditions, panel.dataset.panel ?? "");
    panel.disabled = state.disabled;
    setPressed(panel, state.pressed);
  }
}
