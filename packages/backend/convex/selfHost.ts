import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { createAuth } from "./auth";

export const ownerExists = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) =>
    (await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "user" })) !== null,
});

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

export const signingKeys = internalAction({
  args: {},
  handler: async (ctx) => JSON.stringify(await createAuth(ctx).api.getLatestJwks()),
});
