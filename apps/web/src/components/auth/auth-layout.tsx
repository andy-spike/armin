import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** Centered single-column frame shared by the sign-in family of pages. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="notebook-bg flex min-h-dvh flex-col items-center px-4 py-10 sm:py-16">
      <Link
        to="/"
        className="font-serif text-2xl font-semibold tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Armin
      </Link>
      <main className="mt-8 w-full max-w-sm border border-border bg-surface px-6 py-8 shadow-sm sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
      {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-again/40 bg-again/10 px-3 py-2 text-sm text-ink">
      {message}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-md border border-accent/40 bg-accent-tint px-3 py-2 text-sm text-ink">
      {children}
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

/** Better Auth client errors carry a message; fall back to a plain sentence. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return "Something went wrong. Try again.";
  if (error.code === "EMAIL_NOT_VERIFIED") {
    return "Verify your email first. We just sent you a new link.";
  }
  if (error.code === "INVALID_EMAIL_OR_PASSWORD") return "Email or password is incorrect.";
  return error.message || "Something went wrong. Try again.";
}
