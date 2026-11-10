import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { selfHosted } from "@/lib/self-host";
import { cn } from "@/lib/utils";

export function SelfHostedBadge({ className }: { className?: string }) {
  if (!selfHosted) return null;
  return (
    <Tooltip content="A personal Armin instance run by its owner, not by armincards.app.">
      <Badge
        className={cn(
          "border border-border bg-surface-sunken font-sans text-[0.6875rem] leading-none text-muted",
          className,
        )}
      >
        Self-hosted
      </Badge>
    </Tooltip>
  );
}
