import { cn } from "@/lib/utils";

// shadcn/ui Skeleton. The stock `bg-muted animate-pulse` is swapped for the
// app's `.skeleton` shimmer, because `muted` is a text color in this theme.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
