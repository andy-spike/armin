"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { signInMock } from "@/lib/mock/session";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    setTimeout(() => {
      signInMock(email.trim());
      router.replace("/");
      router.refresh();
    }, 250);
  };

  const isUp = mode === "sign-up";

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
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-text)]">
            Email
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/60 focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-text)]">
            Password
            <input
              type="password"
              required
              placeholder={isUp ? "At least 8 characters" : "••••••••"}
              className="rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/60 focus:border-[var(--color-accent)]"
            />
          </label>
          <Button type="submit" variant="primary" size="lg" busy={pending}>
            {isUp ? "Create account" : "Sign in"}
          </Button>
        </form>
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
      <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]/70">
        Mock auth — any email works
      </p>
    </section>
  );
}
