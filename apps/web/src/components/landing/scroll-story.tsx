import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Lock, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SOURCE_CODE_URL } from "@/lib/source-code";
import { cn } from "@/lib/utils";
import { HERO_SHOT, cameraTransform, createScene, settledReviewFrame } from "./story-scene";
import {
  CARD_BACK,
  CARD_FRONT,
  DECK,
  DECK_EDGES,
  FIELD,
  FIELD_EDGES,
  FIELD_WAVE_START,
  DECK_NAME,
  REVIEWS,
  edgePath,
  fieldStates,
  type NodeState,
} from "./story-data";

const BEATS: { title: string; body: ReactNode; long?: boolean }[] = [
  {
    title: "Write a card for one idea.",
    body: (
      <>
        <p>
          Front and back in Markdown, with code, images, and equations. Basic, reversed, cloze,
          type-the-answer, and image-occlusion cards are built in.
        </p>
        <p>Write them yourself, import an Anki deck, or have an AI assistant draft them.</p>
      </>
    ),
  },
  {
    title: "Then link what it builds on.",
    body: (
      <p>
        In the deck's graph, drag a link to the new card from each card it depends on. It stays
        locked until all of them are learned, so it only comes up once you're ready for it.
      </p>
    ),
  },
  {
    title: "Review what's due in a few keys.",
    body: (
      <>
        <p>
          Armin puts the cards that are due in front of you. Space shows the answer, and 1 to 4
          grades how well you knew it.
        </p>
        <p>
          FSRS turns each grade into the next due date, so shaky cards come back soon and solid ones
          rarely.
        </p>
      </>
    ),
    long: true,
  },
  {
    title: "Watch the next layer open.",
    body: (
      <p>
        Once a card's foundations are learned it unlocks, and you review it like any other. It stays
        unlocked even if a foundation slips later; FSRS brings that foundation back for practice.
      </p>
    ),
  },
  {
    title: "Build a whole subject this way.",
    body: (
      <p>
        Card by card, your decks grow into a map of what you know, foundations at the bottom. Your
        library lives in your account, on the web and the mobile app, and exports as a ZIP any time.
        Armin is open source:{" "}
        <a
          href={SOURCE_CODE_URL}
          className="text-ink underline decoration-ui-3 underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          read the code
        </a>
        .
      </p>
    ),
  },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The frame reduced motion shows for each beat; review has one per card. */
const SETTLED = [0, 1.9, 2.9, null, 4.9, 5.9];

/**
 * The landing page's story: captions scroll past one pinned example deck, and
 * each caption drives the deck through a step of using Armin. Scroll position
 * maps to a timeline (see story-scene.ts); the displayed time eases towards it
 * so wheel steps glide instead of jumping.
 */
export function ScrollStory() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stage = root.querySelector<HTMLElement>("[data-stage]")!;
    const scene = createScene(stage, [
      ...root.querySelectorAll<HTMLElement>("[data-review-steps]"),
    ]);
    const beats = [...root.querySelectorAll<HTMLElement>("[data-beat]")];
    const spine = root.querySelector<HTMLElement>("[data-spine]")!;
    const spineFill = root.querySelector<HTMLElement>("[data-spine-fill]")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1024px)");

    let tops: number[] = [];
    let heights: number[] = [];
    let spineTop = 0;
    let spineHeight = 1;
    let viewport = window.innerHeight;
    let target = 0;
    let shown = 0;
    let shownBeat = -1;
    let shownFrame = -1;
    let last = 0;
    let frame = 0;

    // A caption's beat plays while the caption rises from the lower edge of the
    // screen and settles as the caption comes to rest in view: mid-screen beside
    // the stage on wide screens, in the strip below the pinned stage on narrow.
    const anchor = () => viewport * (wide.matches ? 0.85 : 1);

    const measure = () => {
      viewport = window.innerHeight;
      const y = window.scrollY;
      tops = beats.map((beat) => beat.getBoundingClientRect().top + y);
      heights = beats.map((beat) => beat.offsetHeight || 1);
      spineTop = spine.getBoundingClientRect().top + y;
      spineHeight = spine.offsetHeight || 1;
      scene.measure();
    };

    const targetFromScroll = () => {
      const y = window.scrollY;
      const a = anchor();
      // The hero beat runs from the top of the page until the first caption is read.
      let t = clamp01(y / Math.max(1, tops[1]! - a));
      for (let i = 1; i < beats.length; i++) t += clamp01((y + a - tops[i]!) / heights[i]!);
      return t;
    };

    const render = () => {
      const beat = Math.min(beats.length - 1, Math.floor(shown + 1e-6));
      // Reduced motion shows settled frames, crossfaded, not scrubbed: one per
      // beat, and one per graded card in the review beat.
      if (reduce.matches) {
        const settled = SETTLED[beat] ?? settledReviewFrame(shown);
        if (settled !== shownFrame && shownFrame !== -1) {
          stage.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: "ease" });
        }
        shownFrame = settled;
        scene.apply(settled);
      } else {
        scene.apply(shown);
      }
      if (beat !== shownBeat) {
        beats.forEach((el, i) => el.toggleAttribute("data-reached", i <= beat));
        shownBeat = beat;
      }
      const fill = clamp01((window.scrollY + anchor() - spineTop) / spineHeight);
      spineFill.style.transform = `scaleY(${fill.toFixed(4)})`;
    };

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (reduce.matches) shown = target;
      else {
        shown += (target - shown) * (1 - Math.exp(-dt / 90));
        if (Math.abs(target - shown) < 0.0005) shown = target;
      }
      render();
      frame = shown === target ? 0 : requestAnimationFrame(tick);
    };

    const onScroll = () => {
      target = targetFromScroll();
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    target = shown = targetFromScroll();
    render();

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(root);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section
      ref={rootRef}
      aria-labelledby="landing-title"
      className="story mx-auto flex max-w-[76rem] flex-col px-5 sm:px-8 lg:grid lg:grid-cols-12 lg:gap-x-12"
    >
      <div
        data-beat
        className="flex flex-col justify-center pt-10 pb-12 lg:col-span-5 lg:row-start-1 lg:min-h-[calc(100dvh-3.5rem)] lg:py-16"
      >
        <h1
          id="landing-title"
          className="story-rise text-[clamp(2.75rem,6.4vw,4.75rem)] leading-[1.02] tracking-[-0.03em] text-balance text-ink"
        >
          Study in the order knowledge is built.
        </h1>
        <p
          className="story-rise mt-6 max-w-[30rem] text-xl leading-snug text-pretty text-muted"
          style={{ animationDelay: "80ms" }}
        >
          Spaced-repetition flashcards that unlock as their foundations are learned.
        </p>
        <div
          className="story-rise mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 lg:mt-9"
          style={{ animationDelay: "160ms" }}
        >
          <Link to="/sign-up" className={cn(buttonVariants({ size: "lg" }), "h-12 px-7 text-base")}>
            Create a free account
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            to="/sign-in"
            className="text-sm font-medium text-ink underline decoration-ui-3 underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            I already have an account
          </Link>
        </div>
      </div>

      <Stage />

      <ol
        data-spine
        className="story-spine relative mb-[22svh] lg:col-span-5 lg:row-start-2 lg:mb-[25dvh]"
      >
        <span className="story-spine-fill" data-spine-fill aria-hidden />
        {BEATS.map((beat) => (
          <li
            key={beat.title}
            data-beat
            className={cn(
              "story-beat relative flex flex-col py-12",
              beat.long
                ? "min-h-[300svh] justify-start lg:min-h-[340dvh]"
                : "min-h-[60svh] justify-center lg:min-h-[86dvh]",
            )}
          >
            {/* A long beat keeps its caption in view while the stage works through it. */}
            <div className={cn("story-beat-copy relative", beat.long && "story-beat-copy--held")}>
              <span className="story-beat-node" aria-hidden>
                <Lock className="story-beat-locked size-2.5" strokeWidth={2.25} />
                <Check className="story-beat-learned size-3" strokeWidth={2.75} />
              </span>
              <h2 className="text-[clamp(1.875rem,3.2vw,2.625rem)] leading-[1.1] tracking-[-0.02em] text-balance text-ink">
                {beat.title}
              </h2>
              <div className="mt-5 max-w-[34rem] space-y-4 text-base leading-relaxed text-pretty text-muted lg:text-lg">
                {beat.body}
              </div>
              {beat.long && <ReviewSteps className="max-lg:hidden" />}
            </div>
            {/* Narrow screens only have room below the stage for the steps. */}
            {beat.long && <ReviewSteps className="story-steps--held lg:hidden" />}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Where the review beat is: a bar per card that fills as it is reviewed, and a
 * line naming the current step. The stage shows the same thing; this is the
 * readable version beside it.
 */
function ReviewSteps({ className }: { className?: string }) {
  return (
    <div data-review-steps aria-hidden className={cn("mt-7 max-w-[34rem]", className)}>
      <ol className="grid grid-cols-3 gap-3">
        {REVIEWS.map((review, i) => (
          <li
            key={review.id}
            data-review-progress={i}
            data-state="upcoming"
            className="story-progress"
          >
            <span className="story-progress-bar">
              <span data-review-fill={i} className="story-progress-fill" />
            </span>
            <span className="mt-2 block truncate text-xs">
              {DECK.find((n) => n.id === review.id)!.label}
            </span>
          </li>
        ))}
      </ol>
      <p
        data-review-step
        className="mt-4 min-h-[3lh] text-base leading-snug font-medium text-ink lg:min-h-[2lh] lg:text-lg"
      >
        Recall the answer, then press Space.
      </p>
    </div>
  );
}

const INITIAL_FIELD = fieldStates(FIELD_WAVE_START);

/** The pinned example deck the captions drive. Purely illustrative. */
function Stage() {
  return (
    <div
      data-stage
      aria-hidden
      className="story-stage sticky top-14 z-10 -mx-5 h-[min(58svh,34rem)] border-b border-border-strong bg-bg px-4 py-3 sm:-mx-8 sm:px-8 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:h-[calc(100dvh-3.5rem)] lg:self-start lg:border-0 lg:bg-transparent lg:px-0 lg:py-8"
    >
      <div className="story-rise flex h-full flex-col border border-border-strong bg-surface">
        <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-border px-4 font-mono text-[0.6875rem] text-muted">
          <span data-status className="truncate">
            {DECK_NAME}
          </span>
          <span data-meta className="shrink-0 tabular-nums">
            {DECK.length - 1} cards
          </span>
        </div>
        <div className="story-body relative min-h-0 flex-1 overflow-hidden">
          <div className="absolute inset-0 grid place-items-center">
            <div
              data-camera
              className="story-box relative"
              style={{ transform: cameraTransform(HERO_SHOT) }}
            >
              <svg
                className="absolute inset-0 h-full w-full overflow-visible"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <g data-field-edges className="story-field-layer">
                  {FIELD_EDGES.map((edge) => (
                    <path
                      key={edge.key}
                      data-field-edge={edge.key}
                      data-lit={
                        DECK.some((n) => n.id === edge.from) ||
                        INITIAL_FIELD.get(edge.from) === "learned"
                          ? ""
                          : undefined
                      }
                      d={edgePath(edge.from, edge.to)}
                      className="story-field-edge"
                    />
                  ))}
                </g>
                {DECK_EDGES.map((edge) => (
                  <path
                    key={edge.key}
                    data-edge={edge.key}
                    d={edgePath(edge.from, edge.to)}
                    className="story-edge"
                    // Memoization's edges don't exist until the card is linked.
                    style={
                      edge.to === "memo" ? { clipPath: "inset(100% -4px -4px -4px)" } : undefined
                    }
                  />
                ))}
                {DECK_EDGES.map((edge) => (
                  <path
                    key={edge.key}
                    data-lit-edge={edge.key}
                    d={edgePath(edge.from, edge.to)}
                    className="story-lit-edge"
                  />
                ))}
              </svg>

              <div data-field className="story-field-layer">
                {FIELD.map((node) => (
                  <GraphNode
                    key={node.id}
                    data={{ "data-field-node": node.id }}
                    label={node.label}
                    state={INITIAL_FIELD.get(node.id)!}
                    x={node.x}
                    y={node.y}
                  />
                ))}
              </div>

              {DECK.map((node, i) => {
                const reviewed = REVIEWS.find((r) => r.id === node.id);
                const isNew = node.id === "memo";
                return (
                  <GraphNode
                    key={node.id}
                    data={{ "data-node": node.id }}
                    label={node.label}
                    state={isNew ? "new" : node.needs.length === 0 ? "due" : "locked"}
                    x={node.x}
                    y={node.y}
                    // Memoization is the card the story writes, so it starts absent.
                    hidden={isNew}
                    // Foundations arrive first, then each layer above them.
                    introDelay={isNew ? undefined : 200 + (i < 3 ? i : i + 1) * 60}
                  >
                    {reviewed && (
                      <span
                        data-chip={reviewed.id}
                        className={cn(
                          "story-chip",
                          RATINGS[reviewed.rating]!.label === "Easy" ? "bg-easy" : "bg-good",
                        )}
                      >
                        {reviewed.chip}
                      </span>
                    )}
                  </GraphNode>
                );
              })}

              {/* The pointer that drags each link in the linking beat. */}
              <span data-cursor className="story-cursor">
                <svg viewBox="0 0 16 22" className="story-pointer">
                  <path
                    d="M1 1v17.5l4.6-4.4 3 6.9 3-1.3-3-6.8h6.2L1 1z"
                    className="fill-ink stroke-surface"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <EditorPanel />
            <ReviewPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

function GraphNode({
  data,
  label,
  state,
  x,
  y,
  introDelay,
  hidden,
  children,
}: {
  data: Record<string, string>;
  label: string;
  state: NodeState;
  x: number;
  y: number;
  introDelay?: number;
  hidden?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      {...data}
      data-state={state}
      className={cn("story-node", introDelay !== undefined && "story-rise")}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        animationDelay: introDelay !== undefined ? `${introDelay}ms` : undefined,
        opacity: hidden ? 0 : undefined,
      }}
    >
      <span className="story-node-tag">
        <span className="story-tag-learned">
          <Check className="size-3" strokeWidth={2.5} />
          learned
        </span>
        <span className="story-tag-due">
          <span className="size-1.5 bg-accent" />
          due
        </span>
        <span className="story-tag-locked">
          <Lock className="size-3" strokeWidth={2} />
          locked
        </span>
        <span className="story-tag-new">
          <Plus className="size-3" strokeWidth={2.5} />
          new
        </span>
      </span>
      <span className="story-node-label">{label}</span>
      {children}
    </div>
  );
}

function TypedField({ which, label, text }: { which: string; label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1.5 border border-border bg-bg px-3 py-2 text-[0.8125rem] leading-snug text-ink sm:text-[0.9375rem]">
        <span data-typed={which} />
        <span data-caret={which} className="story-caret" />
        <span data-rest={which} className="text-transparent">
          {text}
        </span>
      </p>
    </div>
  );
}

function EditorPanel() {
  return (
    <div data-editor className="story-panel w-[min(25rem,calc(100cqw-2rem))]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5 sm:py-3">
        <span className="font-serif text-base font-semibold text-ink">New card</span>
        <span className="truncate text-xs text-muted">{DECK_NAME}</span>
      </div>
      <div className="space-y-3 px-4 py-3 sm:space-y-4 sm:px-5 sm:py-4">
        <TypedField which="front" label="Front" text={CARD_FRONT} />
        <TypedField which="back" label="Back" text={CARD_BACK} />
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5 sm:px-5 sm:py-3">
        <span className="text-xs text-muted">Basic</span>
        <span
          data-key="save"
          className="story-press inline-flex h-8 items-center bg-accent px-3 text-sm font-medium text-on-accent"
        >
          Save card
        </span>
      </div>
    </div>
  );
}

/** Same fills as the review screen's rating row (review-session.tsx). */
const RATINGS = [
  {
    label: "Again",
    key: "1",
    interval: "10m",
    bg: "bg-again [[data-theme=dark]_&]:bg-[#d35347]",
  },
  { label: "Hard", key: "2", interval: "1d", bg: "bg-hard" },
  { label: "Good", key: "3", interval: "3d", bg: "bg-good [[data-theme=light]_&]:bg-[#637b0a]" },
  { label: "Easy", key: "4", interval: "8d", bg: "bg-easy" },
] as const;

/**
 * The review screen in miniature, working through the three due cards. Each
 * card is a face stacked in the same place; the rating row is shared.
 */
function ReviewPanel() {
  return (
    <div data-review className="story-panel w-[min(33rem,calc(100cqw-1.5rem))]">
      <div className="grid px-4 pt-4 pb-4 sm:px-6 sm:pt-5 sm:pb-5">
        {REVIEWS.map((card, i) => {
          const node = DECK.find((n) => n.id === card.id)!;
          return (
            <div key={card.id} data-face={i} className="story-face">
              <div className="flex items-center justify-between font-mono text-xs text-muted tabular-nums">
                <span>
                  {i + 1} / {REVIEWS.length}
                </span>
                <span>{node.label}</span>
              </div>
              <p className="mt-3 text-base leading-snug font-medium text-pretty text-ink sm:mt-4 sm:text-xl">
                {card.front}
              </p>
              <div
                data-answer={i}
                className="story-answer mt-3 border-t border-border pt-3 text-sm leading-relaxed text-pretty text-ink/90 sm:mt-4 sm:pt-4 sm:text-base"
              >
                {card.back}
              </div>
            </div>
          );
        })}
      </div>
      <div className="story-actions grid h-14 px-2 pb-2 sm:h-16">
        <span
          data-key="space"
          className="story-show story-press flex items-center justify-center gap-2 bg-accent text-sm font-medium text-on-accent"
        >
          Show answer
          <Kbd className="border-on-accent/25 bg-ink/10 text-on-accent shadow-none">Space</Kbd>
        </span>
        <span className="story-ratings grid grid-cols-4 gap-1.5">
          {RATINGS.map((rating, i) => (
            <span
              key={rating.label}
              data-key={`r${i}`}
              className={cn(
                "story-press flex min-w-0 flex-col items-center justify-center gap-0.5 text-xs font-medium text-on-accent sm:text-sm",
                rating.bg,
              )}
            >
              <span className="flex items-center gap-1">
                {rating.label}
                <Kbd className="border-on-accent/25 bg-ink/10 text-on-accent shadow-none max-sm:hidden">
                  {rating.key}
                </Kbd>
              </span>
              <span className="font-mono text-[0.6875rem]">{rating.interval}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
