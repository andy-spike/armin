import { Brain } from "lucide-react";
import { cn } from "@/lib/cn";

export function Brand({
  className,
  tone = "ink",
  size = "md",
}: {
  className?: string;
  tone?: "ink" | "muted";
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        tone === "ink" ? "text-ink" : "text-muted",
        className,
      )}
    >
      <Brain
        size={size === "sm" ? 17 : 20}
        strokeWidth={1.75}
        className="text-accent"
        aria-hidden
      />
      <span
        className={cn(
          "font-serif font-semibold tracking-tight",
          size === "sm" ? "text-lg" : "text-xl",
        )}
      >
        Armin
      </span>
    </span>
  );
}
