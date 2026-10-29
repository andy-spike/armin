import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cramCountQuery } from "@/lib/queries";
import { ALL_CRAM_STATES, CRAM_STATE_OPTIONS } from "@/lib/cram";
import { plural } from "@/lib/utils";

const ANY_TAG = "__any__";

function clampDays(raw: string) {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.min(365, Math.max(1, value)) : 7;
}

/**
 * Cram setup for one deck: which states, tag, recent lapses, and locks are in
 * scope. The server counts matches live; Start opens the practice session.
 */
export function CramDialog({
  deckId,
  tags,
  open,
  onClose,
}: {
  deckId: string;
  tags: string[];
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [states, setStates] = useState<number[]>(ALL_CRAM_STATES);
  const [tag, setTag] = useState<string | null>(null);
  const [forgotten, setForgotten] = useState(false);
  const [forgottenDaysInput, setForgottenDaysInput] = useState("7");
  const [includeLocked, setIncludeLocked] = useState(false);
  const [maxCardsInput, setMaxCardsInput] = useState("");

  const forgottenDays = clampDays(forgottenDaysInput);
  const daysValid =
    /^\d+$/.test(forgottenDaysInput.trim()) &&
    Number(forgottenDaysInput) >= 1 &&
    Number(forgottenDaysInput) <= 365;
  const maxTrimmed = maxCardsInput.trim();
  const maxValid = maxTrimmed === "" || (/^\d+$/.test(maxTrimmed) && Number(maxTrimmed) >= 1);

  const filters = useMemo(
    () => ({
      states: [...states].sort((a, b) => a - b),
      tag: tag ?? undefined,
      forgottenWithinDays: forgotten ? forgottenDays : undefined,
      includeLocked,
    }),
    [states, tag, forgotten, forgottenDays, includeLocked],
  );

  const countQuery = useQuery({ ...cramCountQuery(deckId, filters), enabled: open });
  const count = countQuery.data ?? 0;
  const canStart =
    !countQuery.isLoading &&
    !countQuery.isError &&
    count > 0 &&
    states.length > 0 &&
    (!forgotten || daysValid) &&
    maxValid;

  const toggleState = (value: number, checked: boolean) => {
    setStates((prev) =>
      checked ? [...new Set([...prev, value])] : prev.filter((state) => state !== value),
    );
  };

  const tagItems = useMemo(
    () => [
      { value: ANY_TAG, label: "Any tag" },
      ...tags.map((name) => ({ value: name, label: name })),
    ],
    [tags],
  );

  const start = () => {
    void navigate({
      to: "/deck/$deckId/cram",
      params: { deckId },
      search: {
        states: [...states].sort((a, b) => a - b).join(","),
        tag: tag ?? undefined,
        forgotten: forgotten ? forgottenDays : undefined,
        locked: includeLocked || undefined,
        max: maxTrimmed === "" ? undefined : Number(maxTrimmed),
      },
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cram this deck"
      description="Practice matching cards without changing their review schedule."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-muted">
            {countQuery.isLoading
              ? "Counting matching cards…"
              : countQuery.isError
                ? "Couldn’t count matching cards."
                : count > 0
                  ? `${plural(count, "review unit")} ${count === 1 ? "matches" : "match"}`
                  : "No cards match these filters."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canStart} onClick={start}>
              <Brain className="h-4 w-4" />
              Start
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Card states</h3>
          <div className="grid grid-cols-2 gap-2">
            {CRAM_STATE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={states.includes(option.value)}
                  onCheckedChange={(checked) => toggleState(option.value, Boolean(checked))}
                />
                {option.label}
              </label>
            ))}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Tag</span>
            <Select
              value={tag ?? ANY_TAG}
              items={tagItems}
              onValueChange={(value) => setTag(value === ANY_TAG ? null : value)}
            >
              <SelectTrigger aria-label="Tag filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {tagItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Max cards</span>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={maxCardsInput}
              onChange={(event) => setMaxCardsInput(event.target.value)}
              placeholder="All matching"
              aria-label="Maximum cards in the session"
            />
            {!maxValid && (
              <span role="alert" className="text-xs text-relearning">
                Enter a whole number, or leave blank for all.
              </span>
            )}
          </label>
        </section>

        <section className="space-y-4">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <label htmlFor="cram-forgotten" className="block text-sm font-medium text-ink">
                  Forgotten recently
                </label>
                <p className="mt-0.5 text-xs text-muted">Only cards you rated Again lately.</p>
              </div>
              <Switch
                id="cram-forgotten"
                checked={forgotten}
                onCheckedChange={setForgotten}
                aria-label="Only cards forgotten recently"
              />
            </div>
            {forgotten && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted">
                <span>Within the last</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  inputMode="numeric"
                  value={forgottenDaysInput}
                  onChange={(event) => setForgottenDaysInput(event.target.value)}
                  aria-label="Forgotten within this many days"
                  className="w-20"
                />
                <span>days</span>
              </div>
            )}
            {forgotten && !daysValid && (
              <p role="alert" className="mt-1 text-xs text-relearning">
                Enter a whole number of days from 1 to 365.
              </p>
            )}
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor="cram-include-locked" className="block text-sm font-medium text-ink">
                Include locked cards
              </label>
              <p className="mt-0.5 text-xs text-muted">
                Cards whose prerequisites are not secured yet. Archived cards stay out.
              </p>
            </div>
            <Switch
              id="cram-include-locked"
              checked={includeLocked}
              onCheckedChange={setIncludeLocked}
              aria-label="Include locked cards"
            />
          </div>
        </section>

        <p className="border-t border-border pt-4 text-xs text-muted">
          Cramming is practice only. Your answers here don&apos;t change when cards are due.
        </p>
      </div>
    </Dialog>
  );
}
