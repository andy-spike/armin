import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { expo } from "@better-auth/expo";
import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { Resend } from "@convex-dev/resend";
import authConfig from "./auth.config";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { markLibraryDeleting } from "./model/deletion";
import { emailLayout } from "./model/email";
import { isReviewer } from "./model/reviewer";
import { isSelfHosted } from "./model/selfHost";

function signUpClosed() {
  return new APIError("FORBIDDEN", {
    code: "SIGN_UP_CLOSED",
    message:
      "Sign-up is closed. This personal Armin instance's account is created on its server with selfhost/create-owner.sh.",
  });
}

function rejectReviewerAccountChange(userId: string) {
  if (isReviewer(userId)) {
    throw new APIError("FORBIDDEN", {
      code: "REVIEWER_ACCOUNT_PROTECTED",
      message: "This shared test account's sign-in details and other sessions cannot be changed.",
    });
  }
}

const protectedReviewerPaths = new Set([
  "/update-user",
  "/change-email",
  "/change-password",
  "/set-password",
  "/delete-user",
  "/delete-user/callback",
  "/link-social",
  "/unlink-account",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
]);

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, user) => {
        if (!isSelfHosted()) return;
        const { page } = await ctx.runQuery(components.betterAuth.adapter.findMany, {
          model: "user",
          paginationOpts: { numItems: 2, cursor: null },
        });
        if (page.some((other: { _id: string }) => other._id !== user._id)) {
          throw new Error("This is a personal Armin instance. It already has its owner account.");
        }
      },
      onDelete: async (ctx, user) => {
        await markLibraryDeleting(ctx, user._id);
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const resend: Resend = new Resend(components.resend, {
  testMode: false,
});

function siteUrl() {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

function emailFrom() {
  return process.env.EMAIL_FROM ?? "Armin <onboarding@resend.dev>";
}

function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

if (!isSelfHosted() && !/localhost|127\.0\.0\.1/.test(siteUrl())) {
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
        if (process.env.REVIEWER_ACCOUNT_USER_ID) {
          if (protectedReviewerPaths.has(ctx.path)) {
            const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
            if (session) rejectReviewerAccountChange(session.user.id);
          }
          if (ctx.path === "/request-password-reset" && typeof ctx.body?.email === "string") {
            const user = await ctx.context.internalAdapter.findUserByEmail(ctx.body.email);
            if (user) rejectReviewerAccountChange(user.user.id);
          }
          if (ctx.path === "/reset-password") {
            const token = ctx.body?.token || ctx.query?.token;
            if (typeof token === "string") {
              const verification = await ctx.context.internalAdapter.findVerificationValue(
                `reset-password:${token}`,
              );
              if (verification) rejectReviewerAccountChange(verification.value);
            }
          }
        }
        if (isSelfHosted() && ctx.path.startsWith("/sign-up")) throw signUpClosed();
        if (emailConfigured()) return;
        if (isSelfHosted()) {
          if (ctx.path === "/request-password-reset" || ctx.path === "/send-verification-email") {
            throw new APIError("SERVICE_UNAVAILABLE", {
              message:
                "This self-hosted instance doesn't send email. Reset the password on the server with selfhost/reset-password.sh.",
              code: "EMAIL_UNAVAILABLE",
            });
          }
          return;
        }
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
      requireEmailVerification: !isSelfHosted(),
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
      sendOnSignUp: !isSelfHosted(),
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
        enabled: true,
        allowDifferentEmails: false,
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => rejectReviewerAccountChange(user.id),
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            if (!isSelfHosted()) return;
            if (context) throw signUpClosed();
            return { data: { ...user, emailVerified: true } };
          },
        },
      },
      account: {
        create: {
          before: async (account, context) => {
            rejectReviewerAccountChange(account.userId);
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
    plugins: [expo(), convex({ authConfig, jwks: process.env.JWKS })],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
