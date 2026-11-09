import { cn } from "@/lib/utils";
import { markEdges, markNodes, markStroke, wordmarkPath, wordmarkViewBox } from "./brand-paths";

export function ArminMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("shrink-0", className)} aria-hidden>
      <path
        d={markEdges}
        fill="none"
        stroke="currentColor"
        strokeWidth={markStroke}
        strokeLinecap="round"
      />
      {markNodes.map((node) => (
        <circle
          key={`${node.cx}-${node.cy}`}
          cx={node.cx}
          cy={node.cy}
          r={node.r}
          fill={node.goal ? "var(--color-accent)" : "currentColor"}
        />
      ))}
    </svg>
  );
}

export function ArminWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={wordmarkViewBox}
      role="img"
      aria-label="Armin"
      className={cn("h-[0.78em] w-auto shrink-0", className)}
    >
      <path d={wordmarkPath} fill="currentColor" />
    </svg>
  );
}
