import { pickLocale } from "../i18n/index.js";
import type { PluginAction, PluginInspectorSection, PluginLocales, PluginText } from "./types.js";

/**
 * What the plugins have contributed, as data.
 *
 * The element asks this what to render; the plugins told it what to add. Keeping
 * the two apart means "what does the chrome show" stays answerable without
 * running a plugin, and a plugin removed really is removed.
 */
export interface RegistryPorts {
  /** Something a plugin contributed changed, so the chrome is out of date. */
  changed(): void;
  /** The locale tag the element is on now, which a plugin's reader follows. */
  locale(): string | null;
}

export class PluginRegistry {
  #actions = new Map<string, PluginAction>();
  #sections = new Map<string, PluginInspectorSection>();
  #teardowns: Array<() => void> = [];
  #ports: RegistryPorts;

  constructor(ports: RegistryPorts) {
    this.#ports = ports;
  }

  /**
   * A plugin's own translations, and the reader for them.
   *
   * The tables are captured, not merged into the editor's: a plugin's keys are
   * its own, so two plugins cannot collide with each other or with Pixen. The
   * reader looks the locale up each time it is called, so a plugin that
   * registered once still follows the element when the language changes.
   */
  addStrings(locales: PluginLocales): PluginText {
    const tables = new Map(Object.entries(locales));
    return (key) => {
      const table = pickLocale(tables, this.#ports.locale()) ?? locales.en;
      // The key itself is the last resort: a missing translation should read as
      // something a developer can search for, not as an empty button.
      return table[key] ?? locales.en[key] ?? key;
    };
  }

  addAction(action: PluginAction): () => void {
    this.#actions.set(action.id, action);
    this.#ports.changed();
    return () => {
      if (this.#actions.delete(action.id)) this.#ports.changed();
    };
  }

  addInspectorSection(section: PluginInspectorSection): () => void {
    this.#sections.set(section.id, section);
    this.#ports.changed();
    return () => {
      if (this.#sections.delete(section.id)) this.#ports.changed();
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
