/**
 * Updating chrome in place.
 *
 * Rebuilding a toolbar to disable one button would throw away focus and cost a
 * layout on every history change, so state that changes often is written onto
 * the existing nodes instead.
 */
/**
 * Finds a control by its action name.
 *
 * The name is compared rather than interpolated into a selector: plugin actions
 * are namespaced `plugin:<id>` and the id comes from a host, so an unquoted
 * attribute selector would throw on the first colon — and quoting alone would
 * still leave a host id containing a quote able to break the selector.
 */
function findAction(host: HTMLElement, action: string): HTMLButtonElement | null {
  for (const control of host.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
    if (control.dataset.action === action) return control;
  }
  return null;
}

export function setDisabled(host: HTMLElement, action: string, disabled: boolean): void {
  const control = findAction(host, action);
  if (control) control.disabled = disabled;
}

/** Keeps a button's tooltip and accessible name in step with the state. */
export function relabel(host: HTMLElement, action: string, label: string): void {
  const control = findAction(host, action);
  if (!control) return;
  control.title = label;
  control.setAttribute("aria-label", label);
}

export function setPressed(control: HTMLElement, pressed: boolean): void {
  control.setAttribute("aria-pressed", String(pressed));
}

/** True while focus is in a text field, where shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  return node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable === true;
}
