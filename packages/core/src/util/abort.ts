import { PixenError } from "../errors/index.js";

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

/**
 * Stops here if the caller has called it off.
 *
 * Cancellation is checked between steps rather than inside them, because none of
 * the steps can be interrupted — no browser lets you stop a decode or an encode
 * part way. So every long operation is a sequence of checks around work that
 * runs to completion, and what "cancelled" buys is that the result is thrown
 * away rather than handed to someone who said they no longer wanted it.
 *
 * `what` names the operation, because an abort reaches a host as an event and
 * "Export was aborted" is more use there than "aborted".
 */
export function throwIfAborted(signal: AbortSignal | undefined, what: string): void {
  if (signal?.aborted) throw new PixenError("ABORTED", `${what} was aborted`);
}
