/**
 * Errors are part of the public API: every failure a host application can
 * reasonably branch on carries a stable `code`.
 */
export type PixenErrorCode =
  | "INVALID_IMAGE"
  | "UNSUPPORTED_FORMAT"
  | "DECODE_FAILED"
  | "ENCODE_FAILED"
  | "MEMORY_LIMIT"
  | "EXPORT_FAILED"
  | "UPLOAD_FAILED"
  | "CORS_ERROR"
  | "RESOURCE_MISSING"
  | "RESOURCE_RELEASED"
  | "INVALID_DOCUMENT"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INVALID_STATE"
  | "ABORTED"
  | "PLUGIN_ERROR"
  | "AI_PROVIDER_ERROR";

export interface PixenErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class PixenError extends Error {
  readonly code: PixenErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: PixenErrorCode, message: string, options: PixenErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PixenError";
    this.code = code;
    this.details = options.details ?? {};
  }
}

export function isPixenError(value: unknown): value is PixenError {
  return value instanceof PixenError;
}

/** Wraps an unknown thrown value, keeping an existing PixenError untouched. */
export function toPixenError(
  value: unknown,
  code: PixenErrorCode,
  message: string,
): PixenError {
  if (isPixenError(value)) return value;
  return new PixenError(code, message, { cause: value });
}
