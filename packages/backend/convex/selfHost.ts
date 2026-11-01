import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { createAuth } from "./auth";

/**
 * Operator-only password reset for a self-hosted instance, which has no email
 * service. Run on the server through selfhost/reset-password.sh; no client can
 * call it. Signs the account out everywhere, like an emailed reset.
 */
export const resetPassword = internalAction({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, { email, password }) => {
    const auth = createAuth(ctx);
    const context = await auth.$context;
    const { minPasswordLength, maxPasswordLength } = context.password.config;
    if (password.length < minPasswordLength || password.length > maxPasswordLength) {
      throw new Error(
        `The password must be ${minPasswordLength} to ${maxPasswordLength} characters long.`,
      );
    }
    const found = await context.internalAdapter.findUserByEmail(email.trim().toLowerCase(), {
      includeAccounts: true,
    });
    if (!found) throw new Error(`No account uses ${email}.`);
    const userId = found.user.id;
    const hash = await context.password.hash(password);
    if (found.accounts.some((account) => account.providerId === "credential")) {
      await context.internalAdapter.updatePassword(userId, hash);
    } else {
      await context.internalAdapter.linkAccount({
        userId,
        providerId: "credential",
        accountId: userId,
        password: hash,
      });
    }
    await context.internalAdapter.deleteUserSessions(userId);
    return `Password changed for ${found.user.email}. Sign in again on every device.`;
  },
});

/**
 * The Better Auth signing key set, created if absent, for the `JWKS`
 * deployment variable. selfhost/setup.sh stores it so token verification reads
 * the keys from the environment instead of fetching this instance's own public
 * JWKS URL. Contains private keys: setup pipes it straight into `convex env set`.
 */
export const signingKeys = internalAction({
  args: {},
  handler: async (ctx) => JSON.stringify(await createAuth(ctx).api.getLatestJwks()),
});
