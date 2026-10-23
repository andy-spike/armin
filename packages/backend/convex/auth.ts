import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { APIError, createAuthMiddleware } from "better-auth/api";
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

/** Whether this deployment can deliver verification and password-reset mail. */
function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Whether this deployment can start Google OAuth. */
function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * A production deployment without optional auth providers still serves
 * existing verified accounts, but sign-up and password reset cannot work.
 * Warn when the module loads so the gap shows up in deployment logs. Local
 * development intentionally runs without them.
 */
if (!/localhost|127\.0\.0\.1/.test(siteUrl())) {
  if (!emailConfigured()) {
    console.warn(
      "[auth] RESEND_API_KEY is not set: sign-up and password reset are disabled, and verification resends report email as unavailable.",
    );
  }
  if (!googleConfigured()) {
    console.warn(
      "[auth] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not both set: Google sign-in is disabled.",
    );
  }
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
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Better Auth logs a failed email send and still answers 200. When
        // this deployment cannot send mail at all, reject the flows that
        // depend on it before an account or token is created, so the client
        // never claims a message was sent. Existing verified users can still
        // sign in with a password.
        if (emailConfigured()) return;
        if (
          ctx.path === "/sign-up/email" ||
          ctx.path === "/request-password-reset" ||
          ctx.path === "/send-verification-email"
        ) {
          throw new APIError("SERVICE_UNAVAILABLE", {
            message: "Email isn't available right now. Contact support.",
            code: "EMAIL_UNAVAILABLE",
          });
        }
      }),
    },
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
      // Without a provider the send is silently dropped, so skip it and let
      // the client explain why an unverified account can't sign in.
      sendOnSignIn: emailConfigured(),
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
    socialProviders: googleConfigured()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            prompt: "select_account",
          },
        }
      : {},
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
