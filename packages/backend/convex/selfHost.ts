import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { createAuth } from "./auth";

/** Whether the instance's owner account exists. Run by selfhost/setup.sh. */
export const ownerExists = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) =>
    (await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "user" })) !== null,
});

/**
 * Operator-only creation of a self-hosted instance's one account, run on the
 * server by selfhost/create-owner.sh. Website sign-up stays closed, so nobody
 * who reaches the address can claim the instance first. The account is
 * verified at creation (databaseHooks.user), and the user onCreate trigger
 * refuses a second account in the insert's own transaction.
 */
export const createOwner = internalAction({
  args: { email: v.string(), name: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const context = await auth.$context;
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error(`${args.email} isn't an email address.`);
    const { minPasswordLength, maxPasswordLength } = context.password.config;
    if (args.password.length < minPasswordLength || args.password.length > maxPasswordLength) {
      throw new Error(
        `The password must be ${minPasswordLength} to ${maxPasswordLength} characters long.`,
      );
    }
    if ((await context.internalAdapter.countTotalUsers()) > 0) {
      throw new Error("This instance already has its owner account.");
    }
    const user = await context.internalAdapter.createUser({
      email,
      name: args.name.trim() || email.split("@")[0],
      emailVerified: true,
    });
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await context.password.hash(args.password),
    });
    return `Created the owner account ${email}. Sign in with it now.`;
  },
});

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
