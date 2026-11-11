import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { APIError } from "better-auth/api";
import { components } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";

const authLimiter = new RateLimiter(components.authRateLimiter, {
  signIn: { kind: "token bucket", rate: 10, period: 15 * MINUTE, capacity: 10 },
  signUp: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },
  emailSend: { kind: "token bucket", rate: 3, period: HOUR, capacity: 3 },
  signUpGlobal: { kind: "token bucket", rate: 300, period: HOUR, capacity: 100 },
});

const limitByPath = {
  "/sign-in/email": "signIn",
  "/sign-up/email": "signUp",
  "/request-password-reset": "emailSend",
  "/send-verification-email": "emailSend",
} as const;

type LimitedPath = keyof typeof limitByPath;

function isLimitedPath(path: string): path is LimitedPath {
  return Object.prototype.hasOwnProperty.call(limitByPath, path);
}

function wait(retryAfter: number) {
  const minutes = Math.max(1, Math.ceil(retryAfter / MINUTE));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

function tooMany(message: string) {
  return new APIError("TOO_MANY_REQUESTS", { code: "RATE_LIMITED", message });
}

export async function enforceAuthLimits(ctx: unknown, path: string, email: unknown) {
  if (!isLimitedPath(path) || typeof email !== "string" || !email.trim()) return;
  if (!ctx || typeof ctx !== "object" || !("runMutation" in ctx)) return;
  const runCtx = ctx as ActionCtx | MutationCtx;
  const key = email.trim().toLowerCase();
  const name = limitByPath[path];
  const result = await authLimiter.limit(runCtx, name, { key });
  if (!result.ok) {
    throw tooMany(
      name === "signIn"
        ? `Too many sign-in attempts for this email. Try again in ${wait(result.retryAfter)}.`
        : name === "signUp"
          ? `Too many sign-up attempts for this email. Try again in ${wait(result.retryAfter)}.`
          : `Too many emails requested for this address. Try again in ${wait(result.retryAfter)}.`,
    );
  }
  if (name === "signUp") {
    const global = await authLimiter.limit(runCtx, "signUpGlobal");
    if (!global.ok) {
      throw tooMany(
        `Armin is getting a lot of sign-ups right now. Try again in ${wait(global.retryAfter)}.`,
      );
    }
  }
}
