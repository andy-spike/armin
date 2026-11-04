import type { ComponentProps, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeybindingHint } from "@/components/keybinding-hint";
import { Tooltip } from "@/components/ui/tooltip";
import { useIsTruncated } from "@/components/ui/truncated-label";
import { formatBinding } from "@/lib/keybindings/keys";
import type { Grade } from "@/types/view-models";

/*
 * Rating colours. Every label, interval, and shortcut chip inside these
 * buttons must clear WCAG AA (4.5:1) in every theme. The `rate-*` tokens are
 * tuned per theme for that (flexoki-theme.css, and `deriveThemeTokens` in
 * @armin/core/themes for every other theme).
 */
export const RATINGS: {
  grade: Grade;
  label: string;
  bg: string;
}[] = [
  {
    grade: 1,
    label: "Again",
    bg: "bg-rate-again hover:bg-rate-again-hover",
  },
  {
    grade: 2,
    label: "Hard",
    bg: "bg-rate-hard hover:bg-rate-hard-hover",
  },
  {
    grade: 3,
    label: "Good",
    bg: "bg-rate-good hover:bg-rate-good-hover",
  },
  {
    grade: 4,
    label: "Easy",
    bg: "bg-rate-easy hover:bg-rate-easy-hover",
  },
];

/** The rebindable command behind each rating button's key hint. */
export const RATING_COMMANDS: Record<Grade, string> = {
  1: "review.rate.again",
  2: "review.rate.hard",
  3: "review.rate.good",
  4: "review.rate.easy",
};

/** A tooltip line naming an action and its current key binding. */
export function ShortcutLabel({ label, binding }: { label: string; binding?: string }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      {binding && <KeybindingHint binding={binding} />}
    </span>
  );
}

/** A menu item's current key binding, aligned to the item's right edge. */
export function MenuShortcut({ binding }: { binding?: string }) {
  if (!binding) return null;
  return (
    <span className="ml-auto pl-4 font-mono text-xs text-muted">{formatBinding(binding)}</span>
  );
}

/** Centers an empty, finished, or error panel in the review frame. */
export function ReviewStatePanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-6 sm:pb-16">
      <div className="flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
        {children}
      </div>
    </div>
  );
}

/** The current card's deck, with its full name in a tooltip when clipped. */
export function DeckLink({ deckId, name }: { deckId: string; name: string }) {
  const { ref, truncated } = useIsTruncated<HTMLAnchorElement>();
  return (
    <Tooltip content={name} disabled={!truncated} className="px-2.5 py-1.5">
      <Link
        ref={ref}
        to="/deck/$deckId"
        params={{ deckId }}
        className="min-w-0 truncate rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {name}
      </Link>
    </Tooltip>
  );
}

/** Undo the last answer, with its shortcut in the tooltip. */
export function UndoButton({
  binding,
  ...button
}: { binding: string | undefined } & Pick<
  ComponentProps<typeof Button>,
  "variant" | "size" | "className" | "busy" | "disabled" | "onClick"
>) {
  return (
    <Tooltip content={<ShortcutLabel label="Undo last answer" binding={binding} />}>
      <Button {...button} aria-label="Undo last review">
        <Undo2 className="h-4 w-4" />
        Undo
      </Button>
    </Tooltip>
  );
}
