import { useId, useMemo, useState } from "react";
import { Checkbox } from "@base-ui/react/checkbox";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Check, ShieldCheck } from "lucide-react";
import { api } from "@armin/backend/api";
import type { Id } from "@armin/backend/types";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn, plural } from "@/lib/utils";

export type AgentScope = "created" | "selected" | "library";

export type AgentPermissions = {
  scope: AgentScope;
  deckIds: Id<"decks">[];
  allowCreateDecks: boolean;
  allowEdits: boolean;
};

/** What a new connection starts with: its own decks only, creation on, edits off. */
export const DEFAULT_AGENT_PERMISSIONS: AgentPermissions = {
  scope: "created",
  deckIds: [],
  allowCreateDecks: true,
  allowEdits: false,
};

/**
 * The permissions to send to the server. Settings that can't apply to the chosen
 * scope are cleared, so a hidden deck list or a dormant edit switch never leaks.
 */
export function normalizePermissions(value: AgentPermissions): AgentPermissions {
  return {
    scope: value.scope,
    deckIds: value.scope === "selected" ? value.deckIds : [],
    allowCreateDecks: value.allowCreateDecks,
    allowEdits: value.scope === "created" ? false : value.allowEdits,
  };
}

/** Why these permissions can't be saved, or null when they can. */
export function permissionsProblem(value: AgentPermissions) {
  if (value.scope === "selected" && value.deckIds.length === 0) {
    return "Pick at least one deck, or choose a different access level.";
  }
  if (value.scope === "created" && !value.allowCreateDecks) {
    return "With no existing decks and no deck creation, this assistant would have nothing to work on.";
  }
  return null;
}

const SCOPE_OPTIONS: { value: AgentScope; title: string; hint: string }[] = [
  {
    value: "created",
    title: "Only what it creates",
    hint: "It starts with a blank slate and can’t see the rest of your library.",
  },
  {
    value: "selected",
    title: "Decks I choose",
    hint: "Its own decks, plus the existing decks you pick.",
  },
  {
    value: "library",
    title: "My whole library",
    hint: "Its own decks, plus every deck you have.",
  },
];

/** Plain-language summary of a set of permissions, for lists and confirmations. */
export function summarizePermissions(
  value: AgentPermissions,
  deckNames: Map<string, string> | undefined,
) {
  const reads =
    value.scope === "library"
      ? "Whole library"
      : value.scope === "selected"
        ? value.deckIds.length === 0
          ? "Its own decks"
          : value.deckIds.length <= 2 && deckNames
            ? value.deckIds.map((id) => deckNames.get(id) ?? "A deck").join(", ")
            : plural(value.deckIds.length, "chosen deck")
        : "Its own decks only";
  const parts = [reads];
  if (value.allowCreateDecks) parts.push("can create decks");
  if (value.scope !== "created" && value.allowEdits) parts.push("can edit existing cards");
  return parts.join(" · ");
}

export function useDeckNames() {
  const decks = useQuery(convexQuery(api.decks.listNames, {}));
  const byId = useMemo(
    () => new Map((decks.data ?? []).map((deck) => [deck.id as string, deck.name])),
    [decks.data],
  );
  return { decks, byId };
}

/** Shown wherever permissions are granted: the limits no setting can lift. */
export function AgentGuardrails({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-[0.8125rem] leading-snug text-muted", className)}>
      <ShieldCheck className="mt-px size-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
      <span>
        Whatever you allow, an assistant can’t permanently delete anything, archived cards can be
        restored, and it works with text cards only. You can revoke access at any time.
      </span>
    </p>
  );
}

/**
 * The editor for one connection's permissions: what it can read, whether it can
 * create decks, and whether it can change what already exists. Used when
 * approving a new connection and when changing one later.
 */
export function AgentPermissionsFields({
  value,
  onChange,
  disabled,
  showProblem = true,
}: {
  value: AgentPermissions;
  onChange: (next: AgentPermissions) => void;
  disabled?: boolean;
  /** Turn off when the caller shows the problem itself, for example beside a disabled save button. */
  showProblem?: boolean;
}) {
  const createLabelId = useId();
  const editLabelId = useId();
  const scopeLabelId = useId();
  const editsDormant = value.scope === "created";
  const problem = permissionsProblem(value);

  return (
    <div className="border border-border bg-surface">
      <div className="border-b border-border pt-3.5">
        <p id={scopeLabelId} className="px-4 text-sm font-medium text-ink">
          What it can see
        </p>
        <RadioGroup
          aria-labelledby={scopeLabelId}
          value={value.scope}
          disabled={disabled}
          onValueChange={(next) => onChange({ ...value, scope: next as AgentScope })}
          className="mt-2.5 divide-y divide-border border-t border-border"
        >
          {SCOPE_OPTIONS.map((option) => (
            <div key={option.value}>
              <Radio.Root
                value={option.value}
                className={cn(
                  "group flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-150 data-checked:bg-accent-tint/50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                )}
              >
                {/* The theme squares every corner, so a diamond keeps "pick one" distinct from the deck checkboxes. */}
                <span
                  aria-hidden
                  className="mt-1 ml-0.5 flex size-3.5 shrink-0 rotate-45 items-center justify-center border border-border-strong bg-surface transition-colors duration-150 group-data-checked:border-accent group-data-checked:bg-accent"
                >
                  <Radio.Indicator className="size-1 bg-on-accent" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{option.title}</span>
                  <span className="block text-[0.8125rem] leading-snug text-muted">
                    {option.hint}
                  </span>
                </span>
              </Radio.Root>
              {option.value === "selected" && value.scope === "selected" && (
                <DeckChecklist
                  selected={value.deckIds}
                  disabled={disabled}
                  onChange={(deckIds) => onChange({ ...value, deckIds })}
                />
              )}
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="flex items-start justify-between gap-6 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <p id={createLabelId} className="text-sm font-medium text-ink">
            Create new decks
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            Decks and cards it creates are always open to it, so it can fix, archive, and restore
            its own work without asking again.
          </p>
        </div>
        <Switch
          checked={value.allowCreateDecks}
          disabled={disabled}
          onCheckedChange={(allowCreateDecks) => onChange({ ...value, allowCreateDecks })}
          aria-labelledby={createLabelId}
          className="mt-0.5"
        />
      </div>

      <div className="flex items-start justify-between gap-6 px-4 py-3.5">
        <div className="min-w-0">
          <p id={editLabelId} className="text-sm font-medium text-ink">
            Edit existing cards
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            {editsDormant
              ? "Off. This only applies once it can see decks you already have."
              : "Lets it change and archive cards in the decks above that it didn’t create. Off, those decks are read-only."}
          </p>
        </div>
        <Switch
          checked={!editsDormant && value.allowEdits}
          disabled={disabled || editsDormant}
          onCheckedChange={(allowEdits) => onChange({ ...value, allowEdits })}
          aria-labelledby={editLabelId}
          className="mt-0.5"
        />
      </div>

      {showProblem && problem && (
        <p
          role="alert"
          className="border-t border-border bg-surface-sunken px-4 py-2.5 text-[0.8125rem] text-ink"
        >
          {problem}
        </p>
      )}
    </div>
  );
}

function DeckChecklist({
  selected,
  onChange,
  disabled,
}: {
  selected: Id<"decks">[];
  onChange: (next: Id<"decks">[]) => void;
  disabled?: boolean;
}) {
  const { decks } = useDeckNames();
  const [query, setQuery] = useState("");
  const all = decks.data ?? [];
  const needle = query.trim().toLowerCase();
  const visible = needle ? all.filter((deck) => deck.name.toLowerCase().includes(needle)) : all;

  if (decks.isLoading) {
    return (
      <p role="status" className="pr-4 pb-3 pl-11 text-[0.8125rem] text-muted">
        Loading your decks…
      </p>
    );
  }
  if (decks.isError) {
    return (
      <p role="alert" className="pr-4 pb-3 pl-11 text-[0.8125rem] text-again">
        Couldn’t load your decks. Reload the page to try again.
      </p>
    );
  }
  if (all.length === 0) {
    return (
      <p className="pr-4 pb-3 pl-11 text-[0.8125rem] text-muted">
        You don’t have any decks yet. Choose “Only what it creates” and it can start one for you.
      </p>
    );
  }

  const toggle = (id: Id<"decks">, checked: boolean) =>
    onChange(checked ? [...selected, id] : selected.filter((value) => value !== id));

  return (
    <div className="pr-4 pb-3 pl-11">
      {all.length > 7 && (
        <Input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search decks"
          aria-label="Search decks"
          className="mb-2 h-8"
        />
      )}
      <ul
        aria-label="Decks it can see"
        className="armin-scrollbar max-h-52 overflow-y-auto border border-border"
      >
        {visible.map((deck) => {
          const checked = selected.includes(deck.id);
          return (
            <li key={deck.id} className="border-b border-border last:border-b-0">
              <label
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm text-ink",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-bg-2",
                )}
              >
                <Checkbox.Root
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(next) => toggle(deck.id, next)}
                  className="flex size-4.5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg data-checked:border-accent data-checked:bg-accent"
                >
                  <Checkbox.Indicator className="text-on-accent">
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  </Checkbox.Indicator>
                </Checkbox.Root>
                <span className="min-w-0 truncate">{deck.name}</span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-2 text-[0.8125rem] text-muted">No decks match “{query}”.</li>
        )}
      </ul>
      <p className="mt-1.5 text-xs text-muted" aria-live="polite">
        {plural(selected.length, "deck")} selected
      </p>
    </div>
  );
}
