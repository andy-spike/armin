import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const CARDS = [
  {
    front: "What does each frame on the call stack hold?",
    back: "The function's arguments, its local variables, and the address to return to when it finishes.",
  },
  {
    front: "Why does a recursive function need a base case?",
    back: "Without one, every call makes another call until the stack overflows. The base case returns without recursing.",
  },
  {
    front: "When does memoization change a recursion's complexity?",
    back: "When the same subproblems recur. Naive Fibonacci makes O(2ⁿ) calls; caching each fib(k) brings it to O(n).",
  },
];

/** Same fills as the review screen's rating row (review-session.tsx). */
const RATINGS = [
  {
    grade: 1,
    label: "Again",
    interval: "10m",
    bg: "bg-again hover:bg-again-deep [[data-theme=dark]_&]:bg-[#d35347] [[data-theme=dark]_&]:hover:bg-[#e0655a]",
  },
  {
    grade: 2,
    label: "Hard",
    interval: "1d",
    bg: "bg-hard hover:bg-hard-deep [[data-theme=dark]_&]:hover:bg-[#e58a4f]",
  },
  {
    grade: 3,
    label: "Good",
    interval: "3d",
    bg: "bg-good hover:bg-good-deep [[data-theme=light]_&]:bg-[#637b0a] [[data-theme=light]_&]:hover:bg-[#5f770a] [[data-theme=dark]_&]:hover:bg-[#9aac4a]",
  },
  {
    grade: 4,
    label: "Easy",
    interval: "8d",
    bg: "bg-easy hover:bg-easy-deep",
  },
] as const;

/**
 * A working miniature of the review screen. Space shows the answer and 1–4
 * grade it while focus is inside the demo, exactly as in the app. Focus moves
 * with the swapped controls so the keys keep working.
 */
export function ReviewDemo() {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const card = CARDS[index % CARDS.length]!;

  const rate = (grade: number) => {
    const rating = RATINGS.find((r) => r.grade === grade);
    if (!rating || !flipped) return;
    setLast(`${rating.label}: back in ${rating.interval}`);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const rootRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef({ flipped, rate });
  useEffect(() => {
    keyRef.current = { flipped, rate };
  });
  const hadFocus = useRef(false);

  // A native listener: the keys must reach the demo from whichever of its
  // buttons holds focus, and the buttons swap as the card flips.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const { flipped, rate } = keyRef.current;
      if (event.key === " " && !flipped) {
        event.preventDefault();
        hadFocus.current = true;
        setFlipped(true);
      } else if (flipped && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        hadFocus.current = true;
        rate(Number(event.key));
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keep focus inside the demo when the control under it is replaced.
  useEffect(() => {
    if (!hadFocus.current) return;
    hadFocus.current = false;
    rootRef.current?.querySelector<HTMLButtonElement>("[data-demo-primary]")?.focus();
  }, [flipped]);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Review demo. Press Space to show the answer, then 1 to 4 to grade it."
      className="group/demo"
    >
      <div className="border border-border-strong bg-surface px-6 pt-8 pb-6 transition-colors group-focus-within/demo:border-accent sm:px-10 sm:pt-10">
        <div className="flex items-center justify-between font-mono text-xs text-muted tabular-nums">
          <span>
            {(index % CARDS.length) + 1} / {CARDS.length}
          </span>
          <span aria-live="polite">{last}</span>
        </div>
        <div key={index} className="animate-flip-in mt-6 min-h-[9.5rem] sm:min-h-[8.5rem]">
          <p className="text-xl leading-snug font-medium text-pretty text-ink">{card.front}</p>
          {flipped && (
            <div className="animate-flip-in mt-5 border-t border-border pt-5">
              <p className="max-w-[52ch] text-lg leading-relaxed text-pretty text-ink/90">
                {card.back}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 h-15">
        {!flipped ? (
          <Button
            size="lg"
            className="h-full w-full"
            data-demo-primary
            onClick={(event) => {
              hadFocus.current = event.detail === 0;
              setFlipped(true);
            }}
          >
            Show answer
          </Button>
        ) : (
          <div className="grid h-full grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <button
                key={r.grade}
                type="button"
                data-demo-primary={r.grade === 3 || undefined}
                onClick={(event) => {
                  hadFocus.current = event.detail === 0;
                  rate(r.grade);
                }}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-sm font-medium text-on-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                  r.bg,
                )}
              >
                <span className="flex items-center gap-1.5">
                  {r.label}
                  <Kbd className="border-on-accent/25 bg-ink/10 text-on-accent shadow-none max-sm:hidden">
                    {r.grade}
                  </Kbd>
                </span>
                <span className="font-mono text-xs">{r.interval}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
