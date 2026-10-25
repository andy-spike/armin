import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type NodeId = "calls" | "stack" | "arrays" | "recursion" | "tables" | "memo" | "dp";

type GraphNode = {
  id: NodeId;
  label: string;
  /** Centre of the node, in % of the canvas. Foundations sit at the bottom. */
  x: number;
  y: number;
  needs: NodeId[];
};

/** An illustrative deck: dynamic programming, built up from its foundations. */
const NODES: GraphNode[] = [
  { id: "calls", label: "Function calls", x: 17, y: 88, needs: [] },
  { id: "stack", label: "The call stack", x: 49, y: 88, needs: [] },
  { id: "arrays", label: "Arrays", x: 82, y: 88, needs: [] },
  { id: "recursion", label: "Recursion", x: 31, y: 62, needs: ["calls", "stack"] },
  { id: "tables", label: "Lookup tables", x: 79, y: 62, needs: ["arrays"] },
  { id: "memo", label: "Memoization", x: 55, y: 37, needs: ["recursion", "tables"] },
  { id: "dp", label: "Dynamic programming", x: 55, y: 12, needs: ["memo"] },
];

/** The order the demo learns the deck in: foundations first, then upwards. */
const SEQUENCE: NodeId[] = ["calls", "stack", "arrays", "recursion", "tables", "memo", "dp"];

const EDGES = NODES.flatMap((node) => node.needs.map((from) => ({ from, to: node.id })));
const BY_ID = new Map(NODES.map((node) => [node.id, node]));

/** Where the cursor rests between runs, below the foundations. */
const CURSOR_HOME = { x: 66, y: 97 };

type NodeState = "learned" | "due" | "locked";

function stateOf(node: GraphNode, learned: ReadonlySet<NodeId>): NodeState {
  if (learned.has(node.id)) return "learned";
  return node.needs.every((id) => learned.has(id)) ? "due" : "locked";
}

function edgePath(fromId: NodeId, toId: NodeId) {
  const a = BY_ID.get(fromId)!;
  const b = BY_ID.get(toId)!;
  const mid = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y}`;
}

/**
 * The landing page's demonstration: a small prerequisite graph that learns
 * itself. A cursor clicks each due card in turn; the edges out of the learned
 * card draw upwards, and each card they reach with all of its foundations
 * learned unlocks. It plays while in view and loops.
 */
export function UnlockGraph({ className }: { className?: string }) {
  // `learned` drives the clicked card and its outgoing edges at once;
  // `settled` trails it, so dependents unlock only once their edges arrive.
  const [learned, setLearned] = useState<ReadonlySet<NodeId>>(() => new Set());
  const [settled, setSettled] = useState<ReadonlySet<NodeId>>(() => new Set());
  const [justUnlocked, setJustUnlocked] = useState<ReadonlySet<NodeId>>(() => new Set());
  const [cursor, setCursor] = useState({ ...CURSOR_HOME, visible: false, clicks: 0 });
  const [hovered, setHovered] = useState<NodeId | null>(null);
  const [pressed, setPressed] = useState(false);
  const [fading, setFading] = useState(false);
  const [inView, setInView] = useState(false);
  const figureRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry!.isIntersecting), {
      threshold: 0.4,
    });
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const timers: number[] = [];
    let cancelled = false;
    // A cleared timer never resolves, so a cancelled run simply stops.
    const wait = (ms: number) =>
      new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)));

    const reset = () => {
      setLearned(new Set());
      setSettled(new Set());
      setJustUnlocked(new Set());
      setHovered(null);
      setCursor((c) => ({ ...c, ...CURSOR_HOME, visible: false }));
    };

    const play = async () => {
      let first = true;
      while (!cancelled) {
        if (!first) {
          // Crossfade back to the start instead of snapping every card shut.
          setFading(true);
          await wait(300);
          reset();
          await wait(500);
          setFading(false);
          await wait(300);
        }
        first = false;
        let done = new Set<NodeId>();
        setCursor((c) => ({ ...c, visible: true }));
        await wait(400);
        for (const id of SEQUENCE) {
          const node = BY_ID.get(id)!;
          setHovered(null);
          setCursor((c) => ({ ...c, x: node.x, y: node.y }));
          await wait(700);
          setHovered(id);
          await wait(220);
          setPressed(true);
          setCursor((c) => ({ ...c, clicks: c.clicks + 1 }));
          await wait(140);
          const after = new Set(done).add(id);
          const opened = NODES.filter(
            (n) => stateOf(n, done) === "locked" && stateOf(n, after) === "due",
          );
          done = after;
          setPressed(false);
          setLearned(after);
          await wait(450);
          setSettled(after);
          setJustUnlocked(new Set(opened.map((n) => n.id)));
          await wait(opened.length > 0 ? 650 : 200);
        }
        setHovered(null);
        setCursor((c) => ({ ...c, visible: false }));
        await wait(3000);
      }
    };
    void play();
    // Leaving the view rewinds the demo, so it restarts from the foundations.
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      reset();
      setPressed(false);
      setFading(false);
    };
  }, [inView]);

  return (
    <figure
      ref={figureRef}
      className={cn("border border-border-strong bg-surface", className)}
      aria-label="Animated example: as each foundation card is learned, the cards that build on it unlock, until the whole tree is open."
    >
      <div className="landing-graph relative mx-auto w-full">
        <span className="absolute top-3 left-4 font-mono text-[0.6875rem] text-muted sm:left-5">
          Example deck
        </span>
        <div className="landing-graph-stage absolute inset-0" data-fading={fading || undefined}>
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {EDGES.map(({ from, to }) => {
              const d = edgePath(from, to);
              return (
                <g key={`${from}-${to}`}>
                  <path
                    d={d}
                    fill="none"
                    className="stroke-ui-3"
                    strokeWidth={1}
                    strokeDasharray="3 4"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={d}
                    fill="none"
                    className="landing-edge stroke-accent"
                    data-lit={learned.has(from) || undefined}
                    strokeWidth={1.75}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </svg>

          <ul className="contents">
            {NODES.map((node) => {
              const state: NodeState = learned.has(node.id)
                ? "learned"
                : node.needs.every((id) => settled.has(id))
                  ? "due"
                  : "locked";
              const isHovered = hovered === node.id && state === "due";
              return (
                <li
                  key={node.id}
                  className="absolute w-[var(--node-w)] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                  <div
                    data-unlocked={justUnlocked.has(node.id) || undefined}
                    data-pressed={(isHovered && pressed) || undefined}
                    className={cn(
                      "landing-node flex w-full flex-col items-start gap-1 border px-2.5 py-2 text-left sm:gap-1.5 sm:px-3 sm:py-3",
                      state === "learned" && "border-accent bg-accent text-on-accent",
                      state === "due" && "border-accent bg-surface text-ink",
                      state === "locked" &&
                        "border-dashed border-ui-3 bg-surface-sunken text-muted",
                      isHovered &&
                        "bg-accent-tint ring-1 ring-accent ring-offset-2 ring-offset-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center gap-1 font-mono text-[0.625rem] leading-none tracking-wide uppercase sm:text-[0.75rem]",
                        state === "learned" && "text-on-accent/85",
                        state === "due" && "text-accent",
                      )}
                    >
                      {state === "learned" && (
                        <Check className="size-3" strokeWidth={2.5} aria-hidden />
                      )}
                      {state === "locked" && (
                        <Lock className="size-3" strokeWidth={2} aria-hidden />
                      )}
                      {state === "due" && <span className="size-1.5 bg-accent" aria-hidden />}
                      {state}
                    </span>
                    <span className="text-[0.8125rem] leading-tight font-medium text-balance sm:text-base">
                      {node.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <span
            className="landing-cursor"
            data-visible={cursor.visible || undefined}
            data-pressed={pressed || undefined}
            style={{ "--cursor-x": `${cursor.x}%`, "--cursor-y": `${cursor.y}%` } as CSSProperties}
            aria-hidden
          >
            <span className="landing-cursor-tip">
              {cursor.clicks > 0 && <span key={cursor.clicks} className="landing-click" />}
              <svg viewBox="0 0 16 22" className="landing-pointer">
                <path
                  d="M1 1v17.5l4.6-4.4 3 6.9 3-1.3-3-6.8h6.2L1 1z"
                  className="fill-ink stroke-surface"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
        </div>
      </div>
    </figure>
  );
}
