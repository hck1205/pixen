import "@pixen/web";
import {
  applyProperties,
  attachEvents,
  type PixenElementProperties,
  type PixenEventHandlers,
  type PixenImageEditorElement,
} from "@pixen/web";

/**
 * `@pixen/svelte` — the editor as a Svelte action.
 *
 * Svelte renders custom elements natively, so this is not a component: it is
 * the one thing the element cannot do for itself, which is keeping structured
 * properties and event handlers in step with reactive values.
 *
 * There is no Svelte compiler in this package and no Svelte dependency. An
 * action is a plain function with `update` and `destroy`, which is a contract
 * rather than a framework — so this works in Svelte 4 and 5 alike, and needs no
 * build step of its own.
 *
 * ```svelte
 * <script>
 *   import { pixen } from "@pixen/svelte";
 *   let tools = ["crop", "redact"];
 * </script>
 *
 * <pixen-image-editor
 *   use:pixen={{ src, tools, export: (result) => upload(result.blob) }}
 *   theme="dark"
 * />
 * ```
 */
export interface PixenActionOptions extends PixenElementProperties, PixenEventHandlers {}

export interface PixenAction {
  update(options: PixenActionOptions): void;
  destroy(): void;
}

export function pixen(node: Element, options: PixenActionOptions = {}): PixenAction {
  const element = node as PixenImageEditorElement;

  // Handlers are read through a box, so `update` can replace them without
  // detaching and re-attaching every listener on every reactive change.
  // Every event is subscribed once and forwarded through a box, so `update`
  // can replace handlers — or add one that was absent at first — without
  // detaching and re-attaching listeners on every reactive change.
  let handlers: PixenEventHandlers = options;
  const detach = attachEvents(element, {
    ready: (detail) => handlers.ready?.(detail),
    load: (detail) => handlers.load?.(detail),
    change: (detail) => handlers.change?.(detail),
    history: (detail) => handlers.history?.(detail),
    export: (detail) => handlers.export?.(detail),
    error: (detail) => handlers.error?.(detail),
  });

  applyProperties(element, options);

  return {
    update(next: PixenActionOptions) {
      handlers = next;
      applyProperties(element, next);
    },
    destroy() {
      detach();
    },
  };
}

export type { PixenElementProperties, PixenImageEditorElement } from "@pixen/web";
