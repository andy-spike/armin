export type SchedulingPreset = "balanced" | "aggressive" | "relaxed" | "custom";

export type PresetValues = {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: string;
  relearningSteps: string;
  prereqStabilityFloor: number;
  newReviewUnitsPerDay: number;
  reviewsPerDay: number | null;
  keepSiblingReviewUnitsTogether: boolean;
};

export const PRESET_FIELDS = [
  "requestRetention",
  "maximumInterval",
  "enableFuzz",
  "enableShortTerm",
  "learningSteps",
  "relearningSteps",
  "prereqStabilityFloor",
  "newReviewUnitsPerDay",
  "reviewsPerDay",
  "keepSiblingReviewUnitsTogether",
] as const satisfies readonly (keyof PresetValues)[];

export const PRESET_VALUES: Record<Exclude<SchedulingPreset, "custom">, PresetValues> = {
  balanced: {
    requestRetention: 0.9,
    maximumInterval: 36500,
    enableFuzz: true,
    enableShortTerm: true,
    learningSteps: "10m",
    relearningSteps: "10m",
    prereqStabilityFloor: 2,
    newReviewUnitsPerDay: 10,
    reviewsPerDay: null,
    keepSiblingReviewUnitsTogether: true,
  },
  aggressive: {
    requestRetention: 0.95,
    maximumInterval: 36500,
    enableFuzz: true,
    enableShortTerm: true,
    learningSteps: "10m",
    relearningSteps: "10m",
    prereqStabilityFloor: 4,
    newReviewUnitsPerDay: 20,
    reviewsPerDay: null,
    keepSiblingReviewUnitsTogether: true,
  },
  relaxed: {
    requestRetention: 0.85,
    maximumInterval: 36500,
    enableFuzz: true,
    enableShortTerm: true,
    learningSteps: "30m",
    relearningSteps: "10m",
    prereqStabilityFloor: 1,
    newReviewUnitsPerDay: 5,
    reviewsPerDay: null,
    keepSiblingReviewUnitsTogether: true,
  },
};

export const PRESET_OPTIONS: { value: SchedulingPreset; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "aggressive", label: "Aggressive" },
  { value: "relaxed", label: "Relaxed" },
  { value: "custom", label: "Custom" },
];

export const SCHEDULING_PRESET_VALUES = PRESET_OPTIONS.map((option) => option.value) as [
  SchedulingPreset,
  ...SchedulingPreset[],
];

export function presetLabel(preset: SchedulingPreset): string {
  return PRESET_OPTIONS.find((option) => option.value === preset)?.label ?? "";
}

export function fieldDiffersFromPreset<K extends keyof PresetValues>(
  preset: SchedulingPreset,
  key: K,
  value: PresetValues[K],
): boolean {
  if (preset === "custom") return false;
  return PRESET_VALUES[preset][key] !== value;
}

export function presetHasOverrides(preset: SchedulingPreset, values: PresetValues): boolean {
  if (preset === "custom") return false;
  return PRESET_FIELDS.some((key) => fieldDiffersFromPreset(preset, key, values[key]));
}
