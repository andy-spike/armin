import { useId, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  BUILT_IN_THEMES,
  MAX_CUSTOM_THEMES,
  MAX_THEME_NAME_LENGTH,
  THEME_SEED_KEYS,
  contrastRatio,
  deriveThemeTokens,
  findTheme,
  isHexColor,
  themeScheme,
  type Appearance,
  type CustomTheme,
  type ThemeDefinition,
  type ThemeMode,
  type ThemeScheme,
  type ThemeSeedKey,
  type ThemeSeeds,
} from "@armin/core/themes";
import { Row, Section } from "@/components/settings-layout";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { notifySaveError } from "@/lib/notify";
import { MODE_OPTIONS } from "@/lib/theme";
import { useLibraryReady } from "@/lib/session";
import { useTheme } from "@/theme/theme-provider";

const SEED_LABELS: Record<ThemeSeedKey, string> = {
  background: "Background",
  text: "Text",
  accent: "Accent",
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

/** A row of a theme's seed colors. */
function Swatches({ seeds, className }: { seeds: ThemeSeeds; className?: string }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 border border-border ${className ?? ""}`}>
      {THEME_SEED_KEYS.map((key) => (
        <span key={key} className="size-3" style={{ backgroundColor: seeds[key] }} />
      ))}
    </span>
  );
}

function ThemeSelect({
  scheme,
  appearance,
  labelId,
  onChange,
}: {
  scheme: ThemeScheme;
  appearance: Appearance;
  labelId: string;
  onChange: (id: string) => void;
}) {
  const fits = (theme: ThemeDefinition) => themeScheme(theme.seeds) === scheme;
  const builtIn = BUILT_IN_THEMES.filter(fits);
  const custom = appearance.customThemes.filter(fits);
  const value = scheme === "light" ? appearance.lightTheme : appearance.darkTheme;
  const items = [...BUILT_IN_THEMES, ...appearance.customThemes].map((theme) => ({
    value: theme.id,
    label: theme.name,
  }));
  return (
    <Select value={value} items={items} onValueChange={(next) => onChange(next as string)}>
      <SelectTrigger className="w-52" aria-labelledby={labelId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {builtIn.map((theme) => (
            <SelectItem key={theme.id} value={theme.id}>
              <Swatches seeds={theme.seeds} />
              {theme.name}
            </SelectItem>
          ))}
        </SelectGroup>
        {custom.length > 0 && (
          <SelectGroup>
            <SelectLabel>Your themes</SelectLabel>
            {custom.map((theme) => (
              <SelectItem key={theme.id} value={theme.id}>
                <Swatches seeds={theme.seeds} />
                {theme.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

/** Account-wide theme choice, built-in themes, and the user's own themes. */
export function ThemeSection() {
  const { appearance, resolved, setAppearance } = useTheme();
  const toast = useToast();
  const signedIn = useLibraryReady();
  const [editing, setEditing] = useState<CustomTheme | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<CustomTheme | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (next: Appearance) => {
    try {
      await setAppearance(next);
      return true;
    } catch (error) {
      notifySaveError(toast, "Theme not saved", error);
      return false;
    }
  };

  const openEditor = (theme: CustomTheme | null) => {
    if (theme) {
      setEditing(theme);
    } else {
      // A new theme starts as a copy of the one on screen.
      const current = findTheme(appearance, resolved.id) ?? BUILT_IN_THEMES[0];
      setEditing({
        id: `custom-${crypto.randomUUID()}`,
        name: `Custom theme ${appearance.customThemes.length + 1}`,
        seeds: { ...current.seeds },
      });
    }
    setEditorOpen(true);
  };

  const saveTheme = async (theme: CustomTheme) => {
    const exists = appearance.customThemes.some((t) => t.id === theme.id);
    const customThemes = exists
      ? appearance.customThemes.map((t) => (t.id === theme.id ? theme : t))
      : [...appearance.customThemes, theme];
    // A new theme takes over the slot for its scheme, so saving shows it.
    const slot = themeScheme(theme.seeds) === "light" ? "lightTheme" : "darkTheme";
    const next = { ...appearance, customThemes, ...(exists ? {} : { [slot]: theme.id }) };
    setBusy(true);
    const ok = await save(next);
    setBusy(false);
    if (ok) setEditorOpen(false);
  };

  const deleteTheme = async () => {
    if (!deleting) return;
    const reset = (id: string, fallback: string) => (id === deleting.id ? fallback : id);
    setBusy(true);
    const ok = await save({
      ...appearance,
      customThemes: appearance.customThemes.filter((t) => t.id !== deleting.id),
      lightTheme: reset(appearance.lightTheme, "flexoki-light"),
      darkTheme: reset(appearance.darkTheme, "flexoki-dark"),
    });
    setBusy(false);
    if (ok) setDeleteOpen(false);
  };

  const atLimit = appearance.customThemes.length >= MAX_CUSTOM_THEMES;

  return (
    <Section
      title="Theme"
      description={
        signedIn
          ? "Saved to your account and used on every device you sign in on."
          : "Used on this device."
      }
      action={
        <>
          <Button variant="outline" size="sm" disabled={atLimit} onClick={() => openEditor(null)}>
            <Plus className="size-4" />
            New theme
          </Button>
          {atLimit && (
            <p className="mt-2 text-xs text-muted">
              You can keep up to {MAX_CUSTOM_THEMES} custom themes.
            </p>
          )}
        </>
      }
    >
      <Row label="Mode" hint="Use the light theme, the dark theme, or follow your system setting.">
        <Segmented
          aria-label="Theme mode"
          options={MODE_OPTIONS}
          value={appearance.mode}
          onChange={(mode: ThemeMode) => void save({ ...appearance, mode })}
        />
      </Row>
      <Row label="Light theme" hint="Shown in light mode.">
        {(labelId) => (
          <ThemeSelect
            scheme="light"
            appearance={appearance}
            labelId={labelId}
            onChange={(lightTheme) => void save({ ...appearance, lightTheme })}
          />
        )}
      </Row>
      <Row
        label="Dark theme"
        hint="Shown in dark mode."
        last={appearance.customThemes.length === 0}
      >
        {(labelId) => (
          <ThemeSelect
            scheme="dark"
            appearance={appearance}
            labelId={labelId}
            onChange={(darkTheme) => void save({ ...appearance, darkTheme })}
          />
        )}
      </Row>
      {appearance.customThemes.length > 0 && (
        <div className="px-4 py-3.5">
          <p className="text-sm font-medium text-ink">Your themes</p>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {appearance.customThemes.map((theme) => (
              <li key={theme.id} className="flex items-center gap-3 py-1.5">
                <Swatches seeds={theme.seeds} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{theme.name}</span>
                <span className="text-xs text-muted">
                  {themeScheme(theme.seeds) === "light" ? "Light" : "Dark"}
                </span>
                <Tooltip content={`Edit ${theme.name}`}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${theme.name}`}
                    onClick={() => openEditor(theme)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </Tooltip>
                <Tooltip content={`Delete ${theme.name}`}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${theme.name}`}
                    onClick={() => {
                      setDeleting(theme);
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </Tooltip>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ThemeEditorDialog
        open={editorOpen}
        theme={editing}
        isNew={!appearance.customThemes.some((t) => t.id === editing?.id)}
        busy={busy}
        onClose={() => setEditorOpen(false)}
        onExitComplete={() => setEditing(null)}
        onSave={(theme) => void saveTheme(theme)}
      />

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onExitComplete={() => setDeleting(null)}
        title="Delete theme?"
        description={
          deleting
            ? `“${deleting.name}” will be removed from your account. Light or dark mode using it switches back to Flexoki.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" busy={busy} onClick={() => void deleteTheme()}>
            Delete theme
          </Button>
        </div>
      </Dialog>
    </Section>
  );
}

function SeedField({
  seedKey,
  value,
  onChange,
}: {
  seedKey: ThemeSeedKey;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  // Follow the color picker without overwriting a hex value mid-typing.
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const label = SEED_LABELS[seedKey];
  return (
    <label className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-sm text-ink">{label}</span>
      <input
        type="color"
        value={value}
        aria-label={`${label} color picker`}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        className="h-8 w-10 shrink-0 cursor-pointer border border-border-strong bg-surface p-0.5"
      />
      <Input
        value={draft}
        aria-label={`${label} hex color`}
        spellCheck={false}
        maxLength={7}
        className="h-8 w-24 font-mono text-[0.8125rem]"
        onChange={(e) => {
          const next = e.target.value.trim().toLowerCase();
          setDraft(next);
          const hex = next.startsWith("#") ? next : `#${next}`;
          if (isHexColor(hex)) onChange(hex);
        }}
        onBlur={() => setDraft(value)}
      />
    </label>
  );
}

/** A small review screen drawn with the edited theme's tokens. */
function ThemePreview({ seeds }: { seeds: ThemeSeeds }) {
  const tokens = deriveThemeTokens({ seeds });
  const style = Object.fromEntries(
    Object.entries(tokens).map(([name, value]) => [`--armin-${name}`, value]),
  );
  const badges = [
    ["New", "bg-new-bg text-new"],
    ["Learning", "bg-learning-bg text-learning"],
    ["Review", "bg-review-bg text-review"],
    ["Relearning", "bg-relearning-bg text-relearning"],
  ];
  const ratings = [
    ["Again", "bg-rate-again"],
    ["Hard", "bg-rate-hard"],
    ["Good", "bg-rate-good"],
    ["Easy", "bg-rate-easy"],
  ];
  return (
    <div
      aria-label="Theme preview"
      role="img"
      style={{ ...style, colorScheme: themeScheme(seeds) }}
      className="border border-border bg-bg-2 p-3 text-ink"
    >
      <div className="border border-border bg-surface p-3">
        <div className="flex flex-wrap gap-1.5">
          {badges.map(([label, classes]) => (
            <span key={label} className={`px-1.5 py-0.5 text-xs font-medium ${classes}`}>
              {label}
            </span>
          ))}
        </div>
        <p className="mt-3 font-serif text-base">What does a prerequisite link represent?</p>
        <p className="mt-1 text-sm text-muted">Knowledge to learn before the dependent card.</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="bg-accent px-2.5 py-1 text-xs font-medium text-on-accent">
            Show answer
          </span>
          <span className="text-xs text-accent">Edit card</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {ratings.map(([label, classes]) => (
          <span
            key={label}
            className={`py-1.5 text-center text-xs font-medium text-on-accent ${classes}`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ThemeEditorDialog({
  open,
  theme,
  isNew,
  busy,
  onClose,
  onExitComplete,
  onSave,
}: {
  open: boolean;
  theme: CustomTheme | null;
  isNew: boolean;
  busy: boolean;
  onClose: () => void;
  onExitComplete: () => void;
  onSave: (theme: CustomTheme) => void;
}) {
  const nameId = useId();
  const [draft, setDraft] = useState<CustomTheme | null>(theme);
  const [source, setSource] = useState(theme);
  if (theme !== source) {
    setSource(theme);
    setDraft(theme);
  }
  if (!draft) return null;

  const name = draft.name.trim();
  const textContrast = contrastRatio(draft.seeds.text, draft.seeds.background);
  const setSeed = (key: ThemeSeedKey, value: string) =>
    setDraft({ ...draft, seeds: { ...draft.seeds, [key]: value } });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onExitComplete={onExitComplete}
      title={isNew ? "New theme" : "Edit theme"}
      description="Pick seven colors. Armin derives borders, tints, and hover shades from them."
      className="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name || name.length > MAX_THEME_NAME_LENGTH}
            busy={busy}
            onClick={() => onSave({ ...draft, name })}
          >
            Save theme
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2.5">
          <div>
            <label htmlFor={nameId} className="text-sm font-medium text-ink">
              Name
            </label>
            <Input
              id={nameId}
              className="mt-1"
              value={draft.name}
              maxLength={MAX_THEME_NAME_LENGTH}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          {THEME_SEED_KEYS.map((key) => (
            <SeedField
              key={key}
              seedKey={key}
              value={draft.seeds[key]}
              onChange={(value) => setSeed(key, value)}
            />
          ))}
        </div>
        <div className="space-y-2">
          <ThemePreview seeds={draft.seeds} />
          <p className="text-xs text-muted">
            {themeScheme(draft.seeds) === "light" ? "Light" : "Dark"} theme, based on the
            background. Accent, rating, and status colors are deepened or lightened where needed so
            text on them stays readable.
          </p>
          {textContrast < 4.5 && (
            <p role="status" className="text-xs text-again">
              Text contrast is {textContrast.toFixed(1)}:1. Aim for at least 4.5:1 so cards stay
              easy to read.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
