/**
 * Decode and encode on a worker thread, with the main thread as the fallback.
 *
 * The protocol is data, the worker body is a serialisable function, and the
 * client is the only part that touches `Worker` — so the framing is testable
 * without a browser and the offload is optional at runtime.
 */
export * from "./protocol.js";
export * from "./client.js";
