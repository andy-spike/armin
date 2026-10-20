import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { expo } from "@better-auth/expo";
import {
  createClient,
  type AuthFunctions,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { Resend } from "@convex-dev/resend";
import authConfig from "./auth.config";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { markLibraryDeleting } from "./model/deletion";
import { emailLayout } from "./model/email";

const authFunctions: AuthFunctions = internal.auth;

/**
 * Better Auth runs inside Convex through the component adapter. Triggers keep
 * the library lifecycle in the same transaction as the auth record change.
 */
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onDelete: async (ctx, user) => {
        // Revoke library access in the same transaction as the user deletion,
        // then let the bounded cleanup job remove study rows and files.
        await markLibraryDeleting(ctx, user._id);
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const resend: Resend = new Resend(components.resend, {
  // Real delivery. Without a verified domain Resend only delivers
  // onboarding@resend.dev mail to the Resend account's own address.
  testMode: false,
});

function siteUrl() {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

function emailFrom() {
  return process.env.EMAIL_FROM ?? "Armin <onboarding@resend.dev>";
}

function mobileOrigins() {
  return (process.env.MOBILE_TRUSTED_ORIGINS ?? "armin://")
    .split(",")
    .map((origin: string) => origin.trim())
    .filter(Boolean);
}

async function sendEmail(
  ctx: GenericCtx<DataModel>,
  to: string,
  subject: string,
  heading: string,
  body: string,
  actionLabel: string,
  url: string,
) {
  await resend.sendEmail(ctx as MutationCtx | ActionCtx, {
    from: emailFrom(),
    to,
    subject,
    html: emailLayout({ heading, body, actionLabel, url }),
    text: `${heading}\n\n${body}\n\n${actionLabel}: ${url}`,
  });
}

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    baseURL: siteUrl(),
    trustedOrigins: [siteUrl(), ...mobileOrigins()],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(
          ctx,
          user.email,
          "Reset your Armin password",
          "Reset your password",
          "Someone asked to reset the password for this Armin account. If that was you, choose a new password with the link below. The link expires in one hour. If it wasn't you, ignore this email.",
          "Reset password",
          url,
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(
          ctx,
          user.email,
          "Verify your email for Armin",
          "Confirm your email",
          "Confirm this address to start saving decks and reviews in Armin.",
          "Verify email",
          url,
        );
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        prompt: "select_account",
      },
    },
    account: {
      accountLinking: {
        // Link only when the provider vouches for the email. No trusted
        // provider shortcut: an unverified Google email never links.
        enabled: true,
        allowDifferentEmails: false,
      },
    },
    user: {
      deleteUser: { enabled: true },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (account, context) => {
            // A verified social identity is about to join an existing user. If
            // that user never verified their email, a password set by whoever
            // registered the address must not survive the link.
            if (account.providerId === "credential" || !context) return;
            const adapter = context.context.internalAdapter;
            const user = await adapter.findUserById(account.userId);
            if (!user || user.emailVerified) return;
            const existing = await adapter.findAccounts(account.userId);
            for (const row of existing) {
              if (row.providerId === "credential") {
                await adapter.deleteAccount(row.id);
              }
            }
          },
        },
      },
    },
    plugins: [expo(), convex({ authConfig })],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));
