"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useTheme } from "@/theme/theme-provider";
import { useSettingsKeymap } from "@/lib/keybindings/dispatcher";
import {
  COMMANDS,
  isModifierKey,
  type Scope,
} from "@/lib/keybindings/registry";
import type { Settings } from "@/lib/shared/contracts";
import { cn } from "@/lib/cn";

const SCOPE_ORDER: Scope[] = ["global", "deck", "review", "cram", "graph"];

const SCOPE_LABELS: Record<Scope, string> = {
  global: "Global",
  deck: "Deck",
  review: "Review",
  cram: "Cram",
  graph: "Graph",
};

export function SettingsPage() {
  const { data: settings } = useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.getSettings(),
  });
  const { effective } = useSettingsKeymap();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const [draft, setDraft] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  const save = useMutation({
    mutationFn: () => api.saveSettings(draft!),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });

  const update = (patch: Partial<Settings>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setSaved(false);
  };

  if (!settings || !draft) {
    return (
      <section className="flex min-h-[50vh] items-center justify-center">
        <p className="font-mono text-xs text-[var(--color-muted)]">
          loading settings…
        </p>
      </section>
    );
  }

  const themeMode = theme === "dark" ? "dark" : "light";

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-10">
      <header>
        <h1 className="font-serif text-3xl text-[var(--color-text)]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Appearance, study defaults, and your keymap.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-[var(--color-text)]">
          Appearance
        </h2>
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTheme(t);
              }}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm capitalize transition-colors",
                themeMode === t
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                  : "border-[var(--color-surface-strong)] text-[var(--color-muted)] hover:text-[var(--color-text)]",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          The theme applies instantly and is remembered per device.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-[var(--color-text)]">Study</h2>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm text-[var(--color-text)]">Review queue limit</p>
            <p className="text-xs text-[var(--color-muted)]">
              How many cards a session pulls at once.
            </p>
          </div>
          <input
            type="number"
            min={1}
            max={200}
            value={draft.reviewQueueLimit}
            onChange={(e) =>
              update({ reviewQueueLimit: Number(e.target.value) })
            }
            className="w-24 rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
          />
        </div>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm text-[var(--color-text)]">New cards per day</p>
            <p className="text-xs text-[var(--color-muted)]">
              Daily cap on cards entering the review rotation.
            </p>
          </div>
          <input
            type="number"
            min={0}
            max={200}
            value={draft.newCardsPerDay}
            onChange={(e) => update({ newCardsPerDay: Number(e.target.value) })}
            className="w-24 rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-[var(--color-text)]">
            Keyboard
          </h2>
          <button
            onClick={() => update({ keybindings: [] })}
            className="text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            Reset all to defaults
          </button>
        </div>
        {SCOPE_ORDER.map((scope) => {
          const commands = COMMANDS.filter((c) => c.scope === scope);
          if (!commands.length) return null;
          return (
            <div key={scope} className="flex flex-col gap-1">
              <p className="pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                {SCOPE_LABELS[scope]}
              </p>
              {commands.map((c) => (
                <BindingRow
                  key={c.id}
                  commandId={c.id}
                  label={c.label}
                  keys={effective.get(c.id) ?? []}
                  overrides={draft.keybindings}
                  onOverride={(keys) => {
                    const rest = draft.keybindings.filter(
                      (k) => k.action !== c.id,
                    );
                    update({ keybindings: [...rest, { action: c.id, keys }] });
                  }}
                  onReset={() => {
                    update({
                      keybindings: draft.keybindings.filter(
                        (k) => k.action !== c.id,
                      ),
                    });
                  }}
                />
              ))}
            </div>
          );
        })}
        <p className="text-xs text-[var(--color-muted)]">
          Chords wait a moment for their second key. Bindings without a
          modifier are suppressed while typing in a field.
        </p>
      </section>

      <div className="flex items-center gap-3 border-t border-[var(--color-surface-strong)] pt-6">
        <Button
          variant="primary"
          size="md"
          busy={save.isPending}
          disabled={!draft}
          onClick={() => save.mutate()}
        >
          Save settings
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-good)]">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </section>
  );
}

function BindingRow({
  commandId,
  label,
  keys,
  overrides,
  onOverride,
  onReset,
}: {
  commandId: string;
  label: string;
  keys: string[];
  overrides: { action: string; keys: string[] }[];
  onOverride: (keys: string[]) => void;
  onReset: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const isOverridden = overrides.some((o) => o.action === commandId);

  useEffect(() => {
    if (!recording) return;
    const keys: string[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setRecording(false);
        setConflict(null);
      }, 1500);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resetTimer();
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("mod");
      if (e.altKey) parts.push("alt");
      if (e.shiftKey && !isModifierKey(e.key)) parts.push("shift");
      if (!isModifierKey(e.key.toLowerCase())) {
        parts.push(e.key === " " ? " " : e.key.toLowerCase());
      }
      const combo = parts.join("+");
      keys.push(combo);

      const candidate = keys.join(",");
      const other = COMMANDS.find(
        (c) =>
          c.id !== commandId &&
          c.keys.join(",") === candidate,
      );
      if (other) {
        setConflict(other.label);
        setRecording(false);
        return;
      }
      setConflict(null);
      setRecording(false);
      onOverride([combo]);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [recording, commandId, onOverride]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--color-surface)]/50">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <span className="flex items-center gap-2">
        {recording ? (
          <span className="animate-pulse font-mono text-xs text-[var(--color-accent)]">
            press keys…
          </span>
        ) : conflict ? (
          <span className="font-mono text-xs text-[var(--color-again)]">
            used by {conflict}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            {keys.map((k, i) => (
              <Kbd key={i}>{k}</Kbd>
            ))}
          </span>
        )}
        {isOverridden && (
          <button
            onClick={onReset}
            className="text-[10px] text-[var(--color-muted)] underline-offset-2 transition-colors hover:text-[var(--color-text)] hover:underline"
          >
            reset
          </button>
        )}
        <button
          onClick={() => {
            setConflict(null);
            setRecording((r) => !r);
          }}
          className="text-xs text-[var(--color-accent)] transition-colors hover:text-[var(--color-text)]"
        >
          {recording ? "cancel" : "change"}
        </button>
      </span>
    </div>
  );
}
