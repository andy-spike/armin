import { ConvexError } from "convex/values";

export type ArminErrorCode =
  | "UNAUTHENTICATED"
  | "EMAIL_NOT_VERIFIED"
  | "NO_LIBRARY"
  | "LIBRARY_DELETING"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID"
  | "QUOTA";

/** A user-facing error with a stable code clients can branch on. */
export function fail(code: ArminErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}
