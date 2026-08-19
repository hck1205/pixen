/**
 * Updating chrome in place.
 *
 * Rebuilding a toolbar to disable one button would throw away focus and cost a
 * layout on every history change, so state that changes often is written onto
 * the existing nodes instead.
 */
function findAction(host: HTMLElement, action: string): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`button[data-action=${action}]`);
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
