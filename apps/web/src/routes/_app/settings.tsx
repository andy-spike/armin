import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { prefetchSettingsPage, settingsQuery as settingsQueryOptions } from "@/lib/queries";
import { armin } from "@/lib/armin-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import {
  MaximumIntervalInput,
  NewCardsPerDayInput,
  RetentionInput,
  ReviewsPerDayInput,
  StabilityFloorInput,
  StepsInput,
} from "@/components/scheduling-inputs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Row, Section } from "@/components/settings-layout";
import { AccountSettings } from "@/components/account-settings";
import { AgentSettings } from "@/components/agent-settings";
import { ExportSettings } from "@/components/export-settings";
import { ImportSettings } from "@/components/import-settings";
import { KeybindingSettings } from "@/components/keybinding-settings";
import { useToast } from "@/components/ui/toast";
import {
  fieldDiffersFromPreset,
  PRESET_OPTIONS,
  PRESET_VALUES,
  presetHasOverrides,
  presetLabel,
  type PresetValues,
  type SchedulingPreset,
} from "@armin/core/scheduling-presets";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import { useTheme } from "@/theme/theme-provider";
import { useEffect, useRef, useState } from "react";
import type { Settings } from "@/types/view-models";

type SettingsState = Pick<
  Settings,
  | "requestRetention"
  | "maximumInterval"
  | "enableFuzz"
  | "enableShortTerm"
  | "learningSteps"
  | "relearningSteps"
  | "weights"
  | "prereqStabilityFloor"
  | "newReviewUnitsPerDay"
  | "reviewsPerDay"
  | "keepSiblingReviewUnitsTogether"
> & { schedulingPreset: SchedulingPreset };

type NamedSchedulingPreset = Exclude<SchedulingPreset, "custom">;

const SETTINGS_TABS = [
  "scheduling",
  "keyboard",
  "assistants",
  "account",
  "data",
  "appearance",
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number];
type SettingsSearch = { tab?: SettingsTab };

function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && (SETTINGS_TABS as readonly string[]).includes(value);
}

const NAMED_PRESET_OPTIONS = PRESET_OPTIONS.filter(
  (option): option is { value: NamedSchedulingPreset; label: string } => option.value !== "custom",
);

const initial: SettingsState = {
  ...PRESET_VALUES.balanced,
  weights: null,
  schedulingPreset: "balanced",
};

function toSettingsState(settings: Settings): SettingsState {
  return {
    requestRetention: settings.requestRetention,
    maximumInterval: settings.maximumInterval,
    enableFuzz: settings.enableFuzz,
    enableShortTerm: settings.enableShortTerm,
    learningSteps: settings.learningSteps,
    relearningSteps: settings.relearningSteps,
    weights: settings.weights,
    prereqStabilityFloor: settings.prereqStabilityFloor,
    newReviewUnitsPerDay: settings.newReviewUnitsPerDay,
    reviewsPerDay: settings.reviewsPerDay,
    keepSiblingReviewUnitsTogether: settings.keepSiblingReviewUnitsTogether,
    schedulingPreset: settings.schedulingPreset as SchedulingPreset,
  };
}

function settingsEqual(a: SettingsState, b: SettingsState): boolean {
  return (Object.keys(a) as (keyof SettingsState)[]).every((key) => a[key] === b[key]);
}

function SettingsPage() {
  const navigate = useNavigate();
  const activeTab = Route.useSearch().tab ?? "scheduling";

  const selectTab = (value: string | number | null) => {
    if (!isSettingsTab(value) || value === activeTab) return;
    // Tab switches are a view change, not a navigation step: replace so Back
    // returns to the page the user came from.
    void navigate({
      to: "/settings",
      search: (previous) => ({ ...previous, tab: value }),
      replace: true,
    });
  };

  return (
    <div className="pb-24">
      <header className="mb-8">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">Settings</h1>
      </header>

      <Tabs value={activeTab} onValueChange={selectTab}>
        <TabsList>
          <TabsTab value="scheduling">Scheduling</TabsTab>
          <TabsTab value="keyboard">Keyboard</TabsTab>
          <TabsTab value="assistants">AI assistants</TabsTab>
          <TabsTab value="account">Account</TabsTab>
          <TabsTab value="data">Data</TabsTab>
          <TabsTab value="appearance">Appearance</TabsTab>
        </TabsList>

        <TabsPanel value="scheduling" className="space-y-10">
          <SchedulingTab />
        </TabsPanel>

        <TabsPanel value="keyboard" className="space-y-10">
          <Section
            title="Keyboard shortcuts"
            description="Rebind app-wide shortcuts for navigation and review. Only the ones you change are saved to your account."
          >
            <KeybindingSettings />
          </Section>
        </TabsPanel>

        <TabsPanel value="assistants" className="space-y-10">
          <AgentSettings />
        </TabsPanel>

        <TabsPanel value="account" className="space-y-10">
          <AccountSettings />
        </TabsPanel>

        <TabsPanel value="data" className="space-y-10">
          <Section
            title="Import"
            description="Bring decks over from Anki. You choose which decks to add and whether to keep your progress."
          >
            <ImportSettings />
          </Section>

          <Section
            title="Export"
            description="Download your library as a ZIP: decks, flashcards, prerequisites, schedules, review history, settings, and images."
          >
            <ExportSettings />
          </Section>
        </TabsPanel>

        <TabsPanel value="appearance" className="space-y-10">
          <AppearanceTab />
        </TabsPanel>
      </Tabs>
    </div>
  );
}

/**
 * The account's scheduling settings as an editable form that saves itself.
 * Every change saves at once; saves run one at a time, and only the latest
 * pending change is sent once the previous save settles.
 */
function useSchedulingSettings() {
  const toast = useToast();
  const query = useQuery(settingsQueryOptions());
  const [settings, setSettings] = useState(initial);
  // Read synchronously by the save queue, ahead of the next render.
  const settingsRef = useRef(initial);
  const loadedRef = useRef(false);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef<SettingsState | null>(null);

  const save = useMutation({
    mutationFn: (patch: SettingsState) => armin.settings.update(patch),
    onError: () => toast({ tone: "error", title: "Couldn’t save settings" }),
  });

  const replace = (next: SettingsState) => {
    settingsRef.current = next;
    setSettings(next);
  };

  const savePending = () => {
    const next = pendingSaveRef.current;
    if (savingRef.current || !next) return;
    pendingSaveRef.current = null;
    savingRef.current = true;
    save.mutate(next, {
      onSettled: () => {
        savingRef.current = false;
        savePending();
      },
    });
  };

  const update = (change: (current: SettingsState) => SettingsState) => {
    const next = change(settingsRef.current);
    if (settingsEqual(next, settingsRef.current)) return;
    replace(next);
    // Nothing saves until the server's values have loaded once.
    if (!loadedRef.current) return;
    pendingSaveRef.current = next;
    savePending();
  };

  // Server values replace the form only while no save is in flight, so a live
  // update can't undo a change the user just made.
  useEffect(() => {
    if (!query.data || savingRef.current || pendingSaveRef.current) return;
    replace(toSettingsState(query.data));
    loadedRef.current = true;
  }, [query.data]);

  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
    update((current) => ({ ...current, [key]: value }));

  /** Switch profile; a named preset also replaces every scheduling value. */
  const selectPreset = (preset: SchedulingPreset) => {
    if (preset === "custom") return set("schedulingPreset", "custom");
    update((current) => ({ ...current, ...PRESET_VALUES[preset], schedulingPreset: preset }));
  };

  /** Copy a named preset's values into Custom, to start from. */
  const fillCustomFrom = (source: NamedSchedulingPreset) =>
    update((current) => ({ ...current, ...PRESET_VALUES[source], schedulingPreset: "custom" }));

  return { settings, query, set, selectPreset, fillCustomFrom };
}

function SchedulingTab() {
  const { settings, query, set, selectPreset, fillCustomFrom } = useSchedulingSettings();
  const preset = settings.schedulingPreset;

  // A named preset shows a reset button on each field that differs from it.
  // Spread onto a <Row>.
  const resetProps = (key: keyof PresetValues) => {
    if (preset === "custom" || !fieldDiffersFromPreset(preset, key, settings[key])) return {};
    const presetValue = PRESET_VALUES[preset][key];
    return { onReset: () => set(key, presetValue) };
  };

  const resetToPreset = () => selectPreset(preset);
  const hasPresetOverrides = presetHasOverrides(preset, settings);

  return (
    <>
      {query.isError && (
        <div className="flex items-center justify-between gap-4 border border-border bg-surface px-4 py-3">
          <p className="text-sm text-muted">Couldn&apos;t load settings.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      <Section
        title="Scheduling profile"
        description="Pick a profile for a tuned set of spaced-repetition settings, or use Custom and fill it from a preset."
        action={
          preset === "custom" ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted">Fill fields from</p>
              <div className="grid gap-1.5">
                {NAMED_PRESET_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant="outline"
                    size="sm"
                    className="w-full justify-center"
                    onClick={() => fillCustomFrom(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : undefined
        }
      >
        <Row
          label="Preset"
          hint="Balanced suits most learners. Aggressive reviews more often. Relaxed reviews less."
          last
        >
          {(labelId) => (
            <Select
              value={preset}
              items={PRESET_OPTIONS}
              onValueChange={(value) => selectPreset(value as SchedulingPreset)}
            >
              <SelectTrigger className="w-44" aria-labelledby={labelId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {PRESET_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </Row>
      </Section>

      <Section
        title="Scheduling"
        description="Tune how FSRS schedules reviews for the selected profile."
      >
        <Row
          label="Desired retention"
          hint="Target recall probability. Higher means more frequent reviews."
          {...resetProps("requestRetention")}
        >
          {(labelId) => (
            <RetentionInput
              value={settings.requestRetention}
              onChange={(value) => set("requestRetention", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
        <Row
          label="Maximum interval"
          hint="The longest gap between reviews, in days."
          {...resetProps("maximumInterval")}
        >
          {(labelId) => (
            <MaximumIntervalInput
              value={settings.maximumInterval}
              onChange={(value) => set("maximumInterval", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
        <Row
          label="Learning steps"
          hint="Short steps for brand-new review units."
          {...resetProps("learningSteps")}
        >
          {(labelId) => (
            <StepsInput
              value={settings.learningSteps}
              onChange={(value) => set("learningSteps", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
        <Row
          label="Relearning steps"
          hint="Steps after you forget a review unit."
          {...resetProps("relearningSteps")}
        >
          {(labelId) => (
            <StepsInput
              value={settings.relearningSteps}
              onChange={(value) => set("relearningSteps", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
        <Row
          label="Interval fuzz"
          hint="Scatter due dates slightly so reviews don't clump."
          {...resetProps("enableFuzz")}
        >
          {(labelId) => (
            <Switch
              checked={settings.enableFuzz}
              onCheckedChange={(value) => set("enableFuzz", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
        <Row
          label="Short-term scheduling"
          hint="Use same-day learning steps for new and lapsed review units."
          last
          {...resetProps("enableShortTerm")}
        >
          {(labelId) => (
            <Switch
              checked={settings.enableShortTerm}
              onCheckedChange={(value) => set("enableShortTerm", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
      </Section>

      <Section
        title="Learning path"
        description="How prerequisite flashcards unlock and how many review units enter each day."
      >
        <Row
          label="Prerequisite stability"
          hint="Required for initial access to dependents. Once earned, access stays unlocked."
          {...resetProps("prereqStabilityFloor")}
        >
          {(labelId) => (
            <StabilityFloorInput
              value={settings.prereqStabilityFloor}
              onChange={(value) => set("prereqStabilityFloor", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
        <Row
          label="New review units per day"
          hint="Maximum brand-new review units introduced across all your decks each day, counted in your account time zone."
          {...resetProps("newReviewUnitsPerDay")}
        >
          {(labelId) => (
            <NewCardsPerDayInput
              value={settings.newReviewUnitsPerDay}
              onChange={(value) => set("newReviewUnitsPerDay", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
        <Row
          label="Reviews per day"
          hint="Maximum total reviews (new and due) across all your decks each day, counted in your account time zone. Leave empty for no limit."
          {...resetProps("reviewsPerDay")}
        >
          {(labelId) => (
            <ReviewsPerDayInput
              value={settings.reviewsPerDay}
              onChange={(value) => set("reviewsPerDay", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
        <Row
          label="Keep siblings together"
          hint="Introduce all eligible directions or clozes for a flashcard in the same session."
          last
          {...resetProps("keepSiblingReviewUnitsTogether")}
        >
          {(labelId) => (
            <Switch
              checked={settings.keepSiblingReviewUnitsTogether}
              onCheckedChange={(value) => set("keepSiblingReviewUnitsTogether", value)}
              aria-labelledby={labelId}
            />
          )}
        </Row>
      </Section>

      {preset !== "custom" && hasPresetOverrides && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={resetToPreset}>
            <RotateCcw className="h-4 w-4" />
            Reset to {presetLabel(preset)} default settings
          </Button>
        </div>
      )}
    </>
  );
}

function AppearanceTab() {
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  return (
    <Section title="Appearance" description="How Armin looks on this device.">
      <Row label="Theme" hint="Flexoki light, Flexoki dark, or match your system setting." last>
        {(labelId) => (
          <Select
            value={themePreference}
            items={THEME_OPTIONS}
            onValueChange={(value) => setThemePreference(value as ThemePreference)}
          >
            <SelectTrigger className="w-44" aria-labelledby={labelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {THEME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </Row>
    </Section>
  );
}

export const Route = createFileRoute("/_app/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: isSettingsTab(search.tab) ? search.tab : undefined,
  }),
  loader: ({ context }) => prefetchSettingsPage(context.queryClient),
  head: () => ({ meta: [{ title: "Settings · Armin" }] }),
  component: SettingsPage,
});
