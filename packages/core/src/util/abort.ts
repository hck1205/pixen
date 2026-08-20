/**
 * An abort controller that also fires when someone else's signal does.
 *
 * The editor owns cancellation of the work it starts — a second load calls off
 * the first — while a caller may hold a signal of their own. Both have to be
 * able to stop the same operation, and `AbortSignal.any` is newer than the
 * browsers Pixen supports, so the two are chained by hand.
 */
export function chainAbort(external?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (!external) return controller;

  if (external.aborted) controller.abort(external.reason);
  else external.addEventListener("abort", () => controller.abort(external.reason), { once: true });

  return controller;
}
