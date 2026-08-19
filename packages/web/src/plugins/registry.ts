import type { PluginAction, PluginInspectorSection } from "./types.js";

/**
 * What the plugins have contributed, as data.
 *
 * The element asks this what to render; the plugins told it what to add. Keeping
 * the two apart means "what does the chrome show" stays answerable without
 * running a plugin, and a plugin removed really is removed.
 */
export class PluginRegistry {
  #actions = new Map<string, PluginAction>();
  #sections = new Map<string, PluginInspectorSection>();
  #teardowns: Array<() => void> = [];
  #onChange: () => void;

  constructor(onChange: () => void) {
    this.#onChange = onChange;
  }

  addAction(action: PluginAction): () => void {
    this.#actions.set(action.id, action);
    this.#onChange();
    return () => {
      if (this.#actions.delete(action.id)) this.#onChange();
    };
  }

  addInspectorSection(section: PluginInspectorSection): () => void {
    this.#sections.set(section.id, section);
    this.#onChange();
    return () => {
      if (this.#sections.delete(section.id)) this.#onChange();
    };
  }

  /** Remembers a plugin's teardown, so detaching the element runs it. */
  retain(teardown: void | (() => void)): void {
    if (typeof teardown === "function") this.#teardowns.push(teardown);
  }

  get actions(): PluginAction[] {
    return [...this.#actions.values()];
  }

  /** The sections whose `when` says yes, in the order they were added. */
  activeSections(): PluginInspectorSection[] {
    return [...this.#sections.values()].filter((section) => section.when?.() !== false);
  }

  /**
   * Runs every teardown and forgets everything.
   *
   * A plugin that throws on the way out must not stop the others from running:
   * this is cleanup, and half-cleanup is worse than the error.
   */
  dispose(): void {
    for (const teardown of this.#teardowns) {
      try {
        teardown();
      } catch {
        // Nothing useful to do with it, and the next plugin still deserves to
        // be torn down.
      }
    }
    this.#teardowns = [];
    this.#actions.clear();
    this.#sections.clear();
  }
}
