import { cn } from "@/lib/cn";

export function Kbd({
  children,
  sequential = false,
  className,
}: {
  children: React.ReactNode;
  sequential?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-4.5 items-center rounded border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-1 font-mono text-[10px] leading-none text-[var(--color-muted)]",
        sequential && "ml-0.5",
        className,
      )}
    >
      {children}
    </span>
  );
}
