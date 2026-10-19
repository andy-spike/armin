import type { ErrorResponse } from "@armin/sync-contract";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode = ErrorResponse["error"]["code"] | "busy";

/** A request failure with a protocol error code, returned as JSON. */
export class SyncError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }

  toResponseBody() {
    return { error: { code: this.code, message: this.message } };
  }
}
