import { betterAuth, type BetterAuthOptions } from "better-auth";

/**
 * Better Auth configuration: Google sign-in only, cookie sessions, stored in the
 * same D1 database as sync data. Better Auth's `user` is the Armin Account; its
 * `account` table is a linked login method, not an Armin Account.
 *
 * Changing this configuration can change Better Auth's tables; regenerate
 * migrations/0001_better_auth_tables.sql if it does.
 */
export function authOptions(env: Env) {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is not configured.");
  }
  return {
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.TRUSTED_ORIGINS.split(",").map((origin) =>
      origin.trim(),
    ),
    emailAndPassword: { enabled: false },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}

let cached: { env: Env; auth: ReturnType<typeof createAuth> } | undefined;

function createAuth(env: Env) {
  return betterAuth(authOptions(env));
}

export function getAuth(env: Env) {
  if (cached?.env !== env) cached = { env, auth: createAuth(env) };
  return cached.auth;
}

/** The authenticated Account id, or null for missing, expired, or revoked sessions. */
export async function authenticatedAccountId(env: Env, headers: Headers) {
  const session = await getAuth(env).api.getSession({ headers });
  return session?.user.id ?? null;
}
