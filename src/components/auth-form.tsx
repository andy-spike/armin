"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isUp = mode === "sign-up";

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = createClient();

    if (isUp) {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (err) {
        setError(err.message);
        setPending(false);
        return;
      }
      if (!data.session) {
        setMessage("Check your email for a confirmation link.");
        setPending(false);
        return;
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        setError(err.message);
        setPending(false);
        return;
      }
    }

    router.replace("/");
    router.refresh();
  };

  const google = async () => {
    setError(null);
    setMessage(null);
    setGooglePending(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError(err.message);
      setGooglePending(false);
    }
  };

  return (
    <section className="flex min-h-dvh flex-col items-center justify-center gap-10 px-4">
      <Brand />
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-surface-strong)] bg-[var(--color-canvas)] p-7">
        <h1 className="font-serif text-2xl text-[var(--color-text)]">
          {isUp ? "Start studying" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          {isUp
            ? "Create your account. The free tier includes every study feature."
            : "Sign in to your study space."}
        </p>
        {error && (
          <p className="mt-4 rounded-lg border border-[var(--color-again)]/30 bg-[var(--color-again)]/10 px-3 py-2 text-xs text-[var(--color-again)]">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
            {message}
          </p>
        )}
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-text)]">
            Email
            <input
              name="email"
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              className="rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/60 focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-text)]">
            Password
            <input
              name="password"
              type="password"
              required
              placeholder={isUp ? "At least 6 characters" : "••••••••"}
              className="rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/60 focus:border-[var(--color-accent)]"
            />
          </label>
          <Button type="submit" variant="primary" size="lg" busy={pending}>
            {isUp ? "Create account" : "Sign in"}
          </Button>
        </form>
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--color-surface-strong)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
            or
          </span>
          <span className="h-px flex-1 bg-[var(--color-surface-strong)]" />
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          busy={googlePending}
          onClick={google}
        >
          <GoogleIcon />
          Continue with Google
        </Button>
        <p className="mt-5 text-center text-xs text-[var(--color-muted)]">
          {isUp ? "Already have an account?" : "New to Armin?"}{" "}
          <Link
            href={isUp ? "/sign-in" : "/sign-up"}
            className="text-[var(--color-accent)] transition-colors hover:text-[var(--color-text)]"
          >
            {isUp ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>
    </section>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v3h3.88c2.26-2.09 3.57-5.17 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3a7.2 7.2 0 0 1-10.76-3.79H1.22v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.31 14.3a7.17 7.17 0 0 1 0-4.6V6.61H1.22a12 12 0 0 0 0 10.78l4.09-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 1.22 6.61l4.09 3.09A7.2 7.2 0 0 1 12 4.8z"
      />
    </svg>
  );
}
