"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrereqDemo } from "@/components/landing/prereq-demo";
import { ReviewDemo } from "@/components/landing/review-demo";
import { DecksDemo } from "@/components/landing/decks-demo";

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div
        aria-hidden="true"
        hidden
        dangerouslySetInnerHTML={{
          __html:
            "<!-- THESIS: A study note, not a pitch -- the page demonstrates how durable knowledge is built (cards locked behind learned foundations, short honest review, a calm desk) and refuses the hero-metric template. OWN-WORLD: Flexoki ink-on-paper. Warm paper field, hairline rules, serif display heads, sans prose, mono figure captions; the product renders itself as the demonstration, no decoration. STORY: The visitor understands knowledge as layers, sees a card stay locked until its foundations are learned, feels the calm of the desk -- and starts studying free. FIRST VIEWPORT: Brand bar with theme toggle and sign-in; a serif headline naming the layering idea; one-line offer; primary Start studying free; below it the first figure -- the interactive stack that unlocks as you press Learn. FORM: Field Notes essay (surface seed 6f7dcf54, assigned structure 5 of the grounded list): hero, three figured demonstrations, two quiet pricing rows, close. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->",
        }}
      />
      <header className="border-b border-ui">
          <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
            <Link href="/" aria-label="Armin — home">
              <Brand />
            </Link>
            <nav className="flex items-center gap-1">
              <ThemeToggle />
              <Link
                href="/sign-in"
                className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-ink outline-none transition-colors hover:bg-bg-2 focus-visible:ring-2 focus-visible:ring-accent"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent outline-none transition-colors hover:bg-accent-deep focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                Start studying free
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-6">
          <section className="py-16 sm:py-24">
            <h1 className="max-w-2xl font-serif text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">
              Knowledge is built in layers.
            </h1>
            <p className="mt-6 max-w-xl text-body-lg text-muted">
              Armin is a calm, keyboard-first flashcard desk where every card
              declares what it depends on — and stays locked until its
              foundations are learned. New material always lands on knowledge
              already secured.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/sign-up"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-6 text-base font-medium text-on-accent outline-none transition-colors hover:bg-accent-deep focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                Start studying free
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </Link>
              <span className="font-mono text-xs text-muted">
                every study feature is free — no card required
              </span>
            </div>
          </section>

          <section className="border-t border-ui py-16 sm:py-24">
            <h2 className="font-serif text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
              Cards that know what they stand on
            </h2>
            <div className="mt-6 grid gap-10 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="max-w-xl text-body-lg text-muted">
                  Most flashcard apps treat every card as an island. Armin
                  treats your knowledge as a graph: each card declares its
                  prerequisites, and a dependent card stays locked until those
                  foundations are learned.
                </p>
                <p className="mt-4 max-w-xl text-body text-muted">
                  The result is a deck that can&apos;t quietly fall apart —
                  you never reach for a card that depends on something you
                  never learned.
                </p>
              </div>
              <div className="mx-auto">
                <PrereqDemo />
              </div>
            </div>
            <p className="mt-10 border-l-2 border-accent pl-3 font-mono text-xs text-muted">
              fig. 1 — a stack of three cards. The third stays locked until
              the second is learned. Press Learn and watch.
            </p>
          </section>

          <section className="border-t border-ui py-16 sm:py-24">
            <h2 className="font-serif text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
              Review is short, honest, and keyboard-first
            </h2>
            <div className="mt-6 grid gap-10 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="mx-auto order-2 sm:order-1">
                <ReviewDemo />
              </div>
              <div className="order-1 sm:order-2">
                <p className="max-w-xl text-body-lg text-muted">
                  Scheduling adapts to your actual recall — no cramming, no
                  guilt. A session is a few minutes: reveal with
                  <span className="text-ink"> space</span>, rate with
                  <span className="text-ink"> 1–4</span>, done. Miss a day and
                  the desk simply waits; it never nags.
                </p>
              </div>
            </div>
            <p className="mt-10 border-l-2 border-accent pl-3 font-mono text-xs text-muted">
              fig. 2 — one card, rated honestly. The interval adapts from how
              you rate it.
            </p>
          </section>

          <section className="border-t border-ui py-16 sm:py-24">
            <h2 className="font-serif text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
              A calm desk, not a dashboard
            </h2>
            <div className="mt-6 grid gap-10 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="max-w-xl text-body-lg text-muted">
                  No badges, no streaks, no confetti. Warm paper, hairline
                  rules, serif names — your decks read like a ledger, and the
                  structure of what you know is one canvas away.
                </p>
                <p className="mt-4 max-w-xl text-body text-muted">
                  Power lives behind the calm surface: prerequisite editing,
                  scheduling internals, AI authoring — reachable, never
                  forced into view.
                </p>
              </div>
              <div className="mx-auto">
                <DecksDemo />
              </div>
            </div>
            <p className="mt-10 border-l-2 border-accent pl-3 font-mono text-xs text-muted">
              fig. 3 — the desk at a glance. Due counts in mono, progress
              counted quietly.
            </p>
          </section>

          <section className="border-t border-ui py-16 sm:py-24">
            <h2 className="font-serif text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
              Free for studying. Five dollars for help.
            </h2>
            <div className="mt-8 max-w-2xl divide-y divide-ui rounded-xl border border-ui-2 bg-paper">
              <div className="flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">Free</p>
                  <p className="mt-1 max-w-md text-sm text-muted">
                    Every study feature: decks, review, cram, browse,
                    prerequisite graphs, Anki import, export and restore.
                    No trial, no card.
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted">
                  $0 / month
                </span>
              </div>
              <div className="flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">
                    AI help
                  </p>
                  <p className="mt-1 max-w-md text-sm text-muted">
                    Generate cards and decks, explain any card on demand,
                    suggest improvements. Your content reaches the model only
                    when you invoke it.
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted">
                  $5 / month
                </span>
              </div>
            </div>
            <p className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/sign-up"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-6 text-base font-medium text-on-accent outline-none transition-colors hover:bg-accent-deep focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                Start studying free
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </Link>
              <Link
                href="/sign-in"
                className="text-sm font-medium text-muted underline decoration-ui-3 underline-offset-4 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
              >
                Sign in instead
              </Link>
            </p>
          </section>
        </main>

        <footer className="border-t border-ui">
          <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-6">
            <Brand tone="muted" />
            <p className="font-mono text-xs text-muted">
              a calm desk for hierarchical knowledge
            </p>
          </div>
        </footer>
    </div>
  );
}
