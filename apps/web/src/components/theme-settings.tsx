import { useId, useState } from "react";
import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import {
  BUILT_IN_THEMES,
  MAX_CUSTOM_THEMES,
  MAX_THEME_NAME_LENGTH,
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
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/theme-provider";

const SEED_GROUPS: { label: string; keys: { key: ThemeSeedKey; label: string }[] }[] = [
  {
    label: "Page",
    keys: [
      { key: "background", label: "Background" },
      { key: "text", label: "Text" },
      { key: "accent", label: "Accent" },
    ],
  },
  {
    label: "Rating buttons",
    keys: [
      { key: "again", label: "Again" },
      { key: "hard", label: "Hard" },
      { key: "good", label: "Good" },
      { key: "easy", label: "Easy" },
    ],
  },
];

const RATING_KEYS = ["again", "hard", "good", "easy"] as const;

/**
 * A theme in miniature: its text on its background, an accent mark, and the
 * four rating colors along the bottom edge.
 */
function ThemeChip({ seeds }: { seeds: ThemeSeeds }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-5 w-9 shrink-0 items-center gap-1 overflow-hidden border border-border-strong pb-0.5 pl-1.5 text-[0.6875rem] leading-none font-semibold"
      style={{ backgroundColor: seeds.background, color: seeds.text }}
    >
      Aa
      <span className="size-1.5" style={{ backgroundColor: seeds.accent }} />
      <span className="absolute inset-x-0 bottom-0 flex h-0.75">
        {RATING_KEYS.map((key) => (
          <span key={key} className="flex-1" style={{ backgroundColor: seeds[key] }} />
        ))}
      </span>
    </span>
  );
}

function ThemeOption({ theme }: { theme: ThemeDefinition }) {
  return (
    <SelectItem value={theme.id} className="py-1.5 pr-8">
      <span className="flex items-center gap-2.5">
        <ThemeChip seeds={theme.seeds} />
        {theme.name}
      </span>
    </SelectItem>
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
  const selected = findTheme(appearance, value);
  const items = [...BUILT_IN_THEMES, ...appearance.customThemes].map((theme) => ({
    value: theme.id,
    label: theme.name,
  }));
  return (
    <Select value={value} items={items} onValueChange={(next) => onChange(next as string)}>
      <SelectTrigger className="w-60 max-sm:w-full" aria-labelledby={labelId}>
        <SelectValue>
          {() =>
            selected && (
              <>
                <ThemeChip seeds={selected.seeds} />
                <span className="truncate">{selected.name}</span>
              </>
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="w-auto min-w-(--anchor-width)">
        <SelectGroup>
          {builtIn.map((theme) => (
            <ThemeOption key={theme.id} theme={theme} />
          ))}
        </SelectGroup>
        {custom.length > 0 && (
          <SelectGroup className="mt-1 border-t border-border pt-1">
            <SelectLabel>Your themes</SelectLabel>
            {custom.map((theme) => (
              <ThemeOption key={theme.id} theme={theme} />
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
        name: `${current.name} copy`.slice(0, MAX_THEME_NAME_LENGTH),
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
    const next = {
      ...appearance,
      customThemes,
      lightTheme:
        slot === "darkTheme" && appearance.lightTheme === theme.id
          ? "flexoki-light"
          : appearance.lightTheme,
      darkTheme:
        slot === "lightTheme" && appearance.darkTheme === theme.id
          ? "flexoki-dark"
          : appearance.darkTheme,
      ...(!exists || appearance.lightTheme === theme.id || appearance.darkTheme === theme.id
        ? { [slot]: theme.id }
        : {}),
    };
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
  const hasCustom = appearance.customThemes.length > 0;

  return (
    <Section
      title="Theme"
      description={
        signedIn
          ? "Saved to your account and used on every device you sign in on."
          : "Used on this device."
      }
    >
      <Row label="Mode" hint="Use the light theme, the dark theme, or match your system.">
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
      <Row label="Dark theme" hint="Shown in dark mode.">
        {(labelId) => (
          <ThemeSelect
            scheme="dark"
            appearance={appearance}
            labelId={labelId}
            onChange={(darkTheme) => void save({ ...appearance, darkTheme })}
          />
        )}
      </Row>
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-6 max-sm:flex-col max-sm:gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Your themes</p>
            <p className="mt-0.5 text-[0.8125rem] text-muted">
              {atLimit
                ? `You have the most custom themes you can keep (${MAX_CUSTOM_THEMES}).`
                : "Start from the theme on screen and pick your own colors."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={atLimit}
            onClick={() => openEditor(null)}
          >
            <Plus className="size-4" />
            New theme
          </Button>
        </div>
        {hasCustom && (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {appearance.customThemes.map((theme) => (
              <li key={theme.id} className="flex items-center gap-3 py-1.5">
                <ThemeChip seeds={theme.seeds} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{theme.name}</span>
                <span className="text-xs text-muted">
                  {themeScheme(theme.seeds) === "light" ? "Light" : "Dark"}
                </span>
                <div className="flex items-center">
                  <Tooltip content="Edit theme">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${theme.name}`}
                      onClick={() => openEditor(theme)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Delete theme">
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

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
            ? `“${deleting.name}” will be removed from your account. If light or dark mode uses it, that mode goes back to Flexoki.`
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

/** A color swatch (opens the system picker) joined to its hex value. */
function SeedField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  // Follow the color picker without overwriting a hex value mid-typing.
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const normalized = draft.startsWith("#") ? draft : `#${draft}`;
  const invalid = !isHexColor(normalized);
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3">
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex h-9 max-w-40 items-center border bg-surface transition-[border-color,box-shadow] duration-150 focus-within:ring-2",
          invalid
            ? "border-again focus-within:ring-again/20"
            : "border-border-strong focus-within:border-accent focus-within:ring-accent-tint",
        )}
      >
        <input
          type="color"
          value={value}
          aria-label={`${label} color picker`}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="ml-1.5 size-6 shrink-0 cursor-pointer appearance-none border border-border-strong bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
        />
        <input
          id={id}
          value={draft}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          aria-invalid={invalid || undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[0.8125rem] text-ink outline-none"
          onChange={(e) => {
            const next = e.target.value.trim().toLowerCase();
            setDraft(next);
            const hex = next.startsWith("#") ? next : `#${next}`;
            if (isHexColor(hex)) onChange(hex);
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
    </div>
  );
}

/** A small review screen drawn with the edited theme's own tokens. */
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
    ["Again", "bg-rate-again", "10m"],
    ["Hard", "bg-rate-hard", "1d"],
    ["Good", "bg-rate-good", "3d"],
    ["Easy", "bg-rate-easy", "8d"],
  ];
  return (
    <div
      role="img"
      aria-label="Preview of a review card in this theme"
      style={{ ...style, colorScheme: themeScheme(seeds) }}
      className="border border-border bg-bg-2 p-3 text-ink"
    >
      <div className="border border-border bg-surface px-4 py-3.5">
        <div className="flex flex-wrap gap-1">
          {badges.map(([label, classes]) => (
            <span key={label} className={`px-1.5 py-0.5 text-xs font-medium ${classes}`}>
              {label}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm leading-snug font-medium">
          What does a prerequisite link represent?
        </p>
        <div className="my-3 h-px w-10 bg-border-strong" />
        <p className="text-sm leading-snug text-muted">
          Knowledge to learn before studying the dependent card.
        </p>
        <p className="mt-3 text-xs">
          <span className="text-accent underline underline-offset-2">Edit card</span>
        </p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {ratings.map(([label, classes, interval]) => (
          <span
            key={label}
            className={`flex flex-col items-center py-1.5 text-xs leading-tight font-medium text-on-accent ${classes}`}
          >
            {label}
            <span className="font-mono text-[0.625rem] opacity-90">{interval}</span>
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
  const formId = useId();
  const [draft, setDraft] = useState<CustomTheme | null>(theme);
  const [source, setSource] = useState(theme);
  if (theme !== source) {
    setSource(theme);
    setDraft(theme);
  }
  if (!draft) return null;

  const name = draft.name.trim();
  const scheme = themeScheme(draft.seeds);
  const textContrast = contrastRatio(draft.seeds.text, draft.seeds.background);
  const setSeed = (key: ThemeSeedKey, value: string) =>
    setDraft({ ...draft, seeds: { ...draft.seeds, [key]: value } });
  const submit = () => {
    if (name && !busy) onSave({ ...draft, name });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onExitComplete={onExitComplete}
      title={isNew ? "New theme" : "Edit theme"}
      description="Pick seven colors. Armin works out borders, tints, and hover shades from them."
      className="max-w-[44rem]"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={!name} busy={busy}>
            Save theme
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor={nameId} className="text-sm font-medium text-ink">
            Name
          </label>
          <Input
            id={nameId}
            value={draft.name}
            maxLength={MAX_THEME_NAME_LENGTH}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <div className="space-y-5">
            {SEED_GROUPS.map((group) => (
              <fieldset key={group.label} className="space-y-2">
                <legend className="mb-2 text-sm font-medium text-ink">{group.label}</legend>
                {group.keys.map(({ key, label }) => (
                  <SeedField
                    key={key}
                    label={label}
                    value={draft.seeds[key]}
                    onChange={(value) => setSeed(key, value)}
                  />
                ))}
              </fieldset>
            ))}
          </div>
          <div className="space-y-2.5 sm:sticky sm:top-0 sm:self-start">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-ink">Preview</p>
              <p className="text-xs text-muted">{scheme === "light" ? "Light" : "Dark"} theme</p>
            </div>
            <ThemePreview seeds={draft.seeds} />
            {textContrast < 4.5 ? (
              <p role="status" className="flex gap-1.5 text-xs leading-snug text-again">
                <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  Text contrast is {textContrast.toFixed(1)}:1. Aim for at least 4.5:1 so cards stay
                  easy to read.
                </span>
              </p>
            ) : (
              <p className="text-xs leading-snug text-muted">
                Light or dark comes from the background. Accent, rating, and status colors shift
                slightly where needed so text on them stays readable.
              </p>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
