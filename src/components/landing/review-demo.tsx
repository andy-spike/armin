"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const RATINGS = [
  { key: "again", label: "Again", interval: "10m", color: "bg-again" },
  { key: "hard", label: "Hard", interval: "1d", color: "bg-hard" },
  { key: "good", label: "Good", interval: "4d", color: "bg-good" },
  { key: "easy", label: "Easy", interval: "15d", color: "bg-easy" },
];

export function ReviewDemo() {
  const [revealed, setRevealed] = useState(false);
  const [rated, setRated] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " && !revealed) {
        e.preventDefault();
        setRevealed(true);
      }
      if (revealed && !rated) {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) setRated(RATINGS[n - 1].key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, rated]);

  const reset = () => {
    setRevealed(false);
    setRated(null);
  };

  return (
    <div ref={containerRef} className="w-full max-w-xl">
      <div className="rounded-xl border border-ui-2 bg-paper px-8 py-10 sm:px-12 sm:py-12">
        <p className="mb-6 font-mono text-xs text-muted">
          1 / 1
          <span className="mx-2 text-ui-3">·</span>
          HTTP
        </p>

        <p className="text-title text-ink">
          What does a <em className="font-serif">304 Not Modified</em> response
          mean for the client&apos;s cache?
        </p>

        {!revealed ? (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="inline-flex h-10 items-center rounded-md bg-accent px-5 text-sm font-medium text-on-accent outline-none transition-colors hover:bg-accent-deep focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              Show answer
            </button>
            <p className="mt-3 font-mono text-xs text-muted">
              press <span className="text-ink">space</span>
            </p>
          </div>
        ) : rated ? (
          <div
            className="mt-8 flex items-baseline gap-2"
            role="status"
            aria-live="polite"
          >
            <p className="font-mono text-sm text-muted">
              {rated === "again"
                ? "10 minutes"
                : rated === "hard"
                  ? "1 day"
                  : rated === "good"
                    ? "4 days"
                    : "15 days"}
            </p>
            <p className="text-sm text-muted">until it comes back.</p>
            <button
              type="button"
              onClick={reset}
              className="ml-auto font-mono text-xs text-muted underline decoration-ui-3 underline-offset-2 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            >
              try again
            </button>
          </div>
        ) : (
          <div className="mt-8">
            <p className="text-body-lg text-ink">
              The server tells the client its cached copy is still valid, so no
              body is sent — the cache is reused without downloading again.
            </p>
            <div className="mt-8 grid grid-cols-4 gap-2">
              {RATINGS.map((r, i) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRated(r.key)}
                  className={cn(
                    "flex flex-col items-center rounded-md px-2 py-3 text-on-accent outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                    r.color,
                  )}
                >
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="mt-1 font-mono text-xs opacity-80">
                    {i + 1} · {r.interval}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="mt-4 text-center font-mono text-xs text-muted">
        space to reveal
        <span className="mx-2 text-ui-3">·</span>1–4 to rate
      </p>
    </div>
  );
}
