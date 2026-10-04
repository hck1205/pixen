/**
 * The two pieces both halves of the machine need.
 *
 * `IDLE` is the state a gesture starts and ends at; `intent` wraps a document
 * change as an effect. Here rather than in either half, because the half that
 * begins a gesture and the half that ends one would otherwise import each other.
 */
import type { Intent } from "@pixen/core";
import type { GestureEffect, GestureState } from "./types.js";

export const IDLE: GestureState = { kind: "idle" };

export const intent = (value: Intent): GestureEffect => ({ kind: "intent", intent: value });
