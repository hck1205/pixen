import type { Editor } from "@pixen/core";
import type { PixenStrings } from "../i18n/index.js";
import type { IconName } from "../theme/index.js";

/**
 * The extension surface.
 *
 * A plugin is a function, not an object with lifecycle methods: it is called
 * once with everything it may touch, and whatever it returns is how it undoes
 * itself. There is no registry to keep in sync and no order to reason about.
 *
 * Most of what a host wants is already reachable — the engine, the events, the
 * properties — so this adds only the two things that were genuinely closed:
 * putting a control in the action cluster, and putting one in the inspector.
 */
export interface PluginContext {
  /** The element the plugin is attached to. */
  readonly element: HTMLElement;
  /** The engine behind it, which is where the actual editing happens. */
  readonly editor: Editor;
  /** The active locale's strings, so a plugin can match the interface. */
  readonly strings: PixenStrings;

  /**
   * Adds a button beside undo, redo and export.
   *
   * Returns a function that removes it, for a plugin that adds controls
   * conditionally rather than once.
   */
  addAction(action: PluginAction): () => void;

  /**
   * Adds controls to the inspector, after whatever the active tool shows.
   *
   * `when` decides whether they appear at all, and is asked on every rebuild —
   * so a control that only makes sense with a selection can say so.
   */
  addInspectorSection(section: PluginInspectorSection): () => void;
}

export interface PluginAction {
  id: string;
  label: string;
  /** One of Pixen's own icons; a plugin without one gets a text button. */
  icon?: IconName;
  /** Shown on the button. Omit for an icon-only control. */
  text?: string;
  /** `primary` reads as the main action, the way Export does. */
  emphasis?: "normal" | "primary";
  onClick(): void;
  /** Asked on every refresh; a disabled control is cheaper than a dead press. */
  disabled?(): boolean;
}

export interface PluginInspectorSection {
  id: string;
  /** Asked on every rebuild. Absent means always. */
  when?(): boolean;
  /** Builds the controls. Called on every rebuild, so it may read live state. */
  build(): Node[];
}

/**
 * A plugin: a setup function returning an optional teardown.
 *
 * Plugins are first-party code — the host imports and passes them — so anything
 * they build is trusted the way the host's own code is.
 */
export type PixenPlugin = (context: PluginContext) => void | (() => void);
