import { icons, type IconName } from "../../theme/index.js";

/**
 * The chrome's vocabulary: buttons, inputs, fields, dividers, readouts.
 *
 * Small factories rather than a template engine, because the chrome is small and
 * the dependency budget is zero. Everything here is presentation only — no
 * factory reads or writes editor state.
 */
export interface ButtonSpec {
  icon?: IconName;
  label: string;
  text?: string;
  className?: string;
  active?: boolean;
  onClick: () => void;
  dataset?: Record<string, string>;
  /** Announced by screen readers as the control's keyboard shortcut. */
  keyShortcuts?: string;
}

export function button(spec: ButtonSpec): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.title = spec.label;
  node.setAttribute("aria-label", spec.label);
  if (spec.keyShortcuts) node.setAttribute("aria-keyshortcuts", spec.keyShortcuts);
  if (spec.className) node.className = spec.className;
  // `active` is a toggle state, so it is announced as well as painted: the CSS
  // reads the attribute, and a screen reader reads it too.
  if (spec.active !== undefined) node.setAttribute("aria-pressed", String(spec.active));
  if (spec.active) node.classList.add("active");
  if (spec.icon) node.appendChild(fragmentFromHTML(icons[spec.icon]));
  if (spec.text) node.appendChild(document.createTextNode(spec.text));
  for (const [key, value] of Object.entries(spec.dataset ?? {})) node.dataset[key] = value;
  node.addEventListener("click", spec.onClick);
  return node;
}

export interface InputSpec {
  type: string;
  value: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  placeholder?: string;
  dataset?: Record<string, string>;
  onInput: (value: string) => void;
  /** Used to wrap a slider drag in one editor transaction. */
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}

export function input(spec: InputSpec): HTMLInputElement {
  const node = document.createElement("input");
  node.type = spec.type;
  node.value = spec.value;
  if (spec.min !== undefined) node.min = String(spec.min);
  if (spec.max !== undefined) node.max = String(spec.max);
  if (spec.step !== undefined) node.step = String(spec.step);
  if (spec.placeholder) node.placeholder = spec.placeholder;
  for (const [key, value] of Object.entries(spec.dataset ?? {})) node.dataset[key] = value;
  node.addEventListener("input", () => spec.onInput(node.value));
  if (spec.onPointerDown) node.addEventListener("pointerdown", spec.onPointerDown);
  if (spec.onPointerUp) {
    node.addEventListener("pointerup", spec.onPointerUp);
    node.addEventListener("pointercancel", spec.onPointerUp);
  }
  return node;
}

/** A labelled control. The label element is the association, so no id is needed. */
export function field(label: string, ...children: Node[]): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.appendChild(document.createTextNode(label));
  for (const child of children) wrapper.appendChild(child);
  return wrapper;
}

export function element(tag: string, options: { text?: string; className?: string } = {}): HTMLElement {
  const node = document.createElement(tag);
  if (options.text) node.textContent = options.text;
  if (options.className) node.className = options.className;
  return node;
}

/**
 * Muted text: a hint about the active tool, or a numeric readout.
 *
 * A numeric readout is written left to right whatever the interface is: in a
 * right-to-left locale the bidirectional algorithm otherwise reorders
 * `1600 × 1067` into `1067 × 1600`, which is not a formatting quibble but the
 * wrong number.
 */
export function readout(text: string): HTMLElement {
  const node = element("span", { text, className: "readout" });
  node.dir = "ltr";
  return node;
}

/** A sentence, which follows the interface's own direction. */
export function hint(text: string): HTMLElement {
  return element("span", { text, className: "readout" });
}

export function divider(): HTMLElement {
  return element("span", { className: "divider" });
}

/** Icons are authored in this package, so the markup is trusted by construction. */
export function fragmentFromHTML(markup: string): Node {
  const host = document.createElement("span");
  host.style.display = "contents";
  host.innerHTML = markup;
  return host;
}
