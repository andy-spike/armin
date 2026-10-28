import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatDays,
  formatRetentionPercent,
  formatStepsString,
  isValidMaximumInterval,
  isValidNewCardsPerDay,
  isValidRetention,
  isValidReviewsPerDay,
  isValidStabilityFloor,
  isValidStepDuration,
  NEW_CARDS_PER_DAY_MAX,
  parseBoundedInt,
  parseDays,
  parseRetentionPercent,
  parseStepsString,
  REVIEWS_PER_DAY_MAX,
  type StepDuration,
} from "@/lib/scheduling-settings";
import { useState } from "react";

const invalidInputClass = "border-again focus-visible:border-again focus-visible:ring-again/30";

/**
 * A text draft of a committed number. The draft resets whenever the committed
 * value changes from outside, adjusted during render rather than in an effect
 * so the stale draft never reaches the screen.
 */
function useSyncedDraft(value: number, format: (value: number) => string) {
  const [draft, setDraft] = useState(format(value));
  const [invalid, setInvalid] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(format(value));
    setInvalid(false);
  }

  return { draft, setDraft, invalid, setInvalid };
}

function UnitLabel({ children }: { children: string }) {
  return <span className="shrink-0 text-[0.8125rem] text-muted">{children}</span>;
}

type RetentionInputProps = {
  value: number;
  onChange: (value: number) => void;
  "aria-labelledby"?: string;
};

export function RetentionInput({
  value,
  onChange,
  "aria-labelledby": labelledBy,
}: RetentionInputProps) {
  const { draft, setDraft, invalid, setInvalid } = useSyncedDraft(value, formatRetentionPercent);

  const handleBlur = () => {
    const parsed = parseRetentionPercent(draft);
    if (parsed !== null && isValidRetention(parsed)) {
      setInvalid(false);
      setDraft(formatRetentionPercent(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(formatRetentionPercent(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(/[^\d]/g, ""));
        }}
        onBlur={handleBlur}
        aria-labelledby={labelledBy}
        aria-invalid={invalid}
        className={cn("w-16 text-right tabular-nums", invalid && invalidInputClass)}
      />
      <UnitLabel>%</UnitLabel>
    </div>
  );
}

type MaximumIntervalInputProps = {
  value: number;
  onChange: (value: number) => void;
  "aria-labelledby"?: string;
};

export function MaximumIntervalInput({
  value,
  onChange,
  "aria-labelledby": labelledBy,
}: MaximumIntervalInputProps) {
  const { draft, setDraft, invalid, setInvalid } = useSyncedDraft(value, formatDays);

  const handleBlur = () => {
    const parsed = parseDays(draft);
    if (parsed !== null && isValidMaximumInterval(parsed)) {
      setInvalid(false);
      setDraft(formatDays(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(formatDays(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(/[^\d,]/g, ""));
        }}
        onBlur={handleBlur}
        aria-labelledby={labelledBy}
        aria-invalid={invalid}
        className={cn("w-24 text-right tabular-nums", invalid && invalidInputClass)}
      />
      <UnitLabel>days</UnitLabel>
    </div>
  );
}

type DurationStepFieldsProps = {
  step: StepDuration;
  onChange: (step: StepDuration) => void;
  labelledBy?: string;
};

function DurationStepFields({ step, onChange, labelledBy }: DurationStepFieldsProps) {
  const [minutesDraft, setMinutesDraft] = useState(String(step.minutes));
  const [secondsDraft, setSecondsDraft] = useState(String(step.seconds));
  const [invalid, setInvalid] = useState(false);
  const [syncedStep, setSyncedStep] = useState(step);

  if (step.minutes !== syncedStep.minutes || step.seconds !== syncedStep.seconds) {
    setSyncedStep(step);
    setMinutesDraft(String(step.minutes));
    setSecondsDraft(String(step.seconds));
    setInvalid(false);
  }

  const commit = (minutes: number, seconds: number) => {
    const next = { minutes, seconds };
    if (!isValidStepDuration(next)) {
      setInvalid(true);
      setMinutesDraft(String(step.minutes));
      setSecondsDraft(String(step.seconds));
      return;
    }
    setInvalid(false);
    onChange(next);
  };

  const handleMinutesBlur = () => {
    const minutes = parseBoundedInt(minutesDraft, 9999);
    const seconds = parseBoundedInt(secondsDraft, 59) ?? step.seconds;
    if (minutes === null) {
      setInvalid(true);
      setMinutesDraft(String(step.minutes));
      return;
    }
    commit(minutes, seconds);
  };

  const handleSecondsBlur = () => {
    const seconds = parseBoundedInt(secondsDraft, 59);
    const minutes = parseBoundedInt(minutesDraft, 9999) ?? step.minutes;
    if (seconds === null) {
      setInvalid(true);
      setSecondsDraft(String(step.seconds));
      return;
    }
    commit(minutes, seconds);
  };

  return (
    <div role="group" aria-labelledby={labelledBy} className="flex items-center gap-1.5">
      <Input
        inputMode="numeric"
        value={minutesDraft}
        onChange={(event) => {
          setInvalid(false);
          setMinutesDraft(event.target.value.replace(/[^\d]/g, ""));
        }}
        onBlur={handleMinutesBlur}
        aria-label="Minutes"
        aria-invalid={invalid}
        className={cn("w-14 text-right tabular-nums", invalid && invalidInputClass)}
      />
      <UnitLabel>min</UnitLabel>
      <Input
        inputMode="numeric"
        value={secondsDraft}
        onChange={(event) => {
          setInvalid(false);
          setSecondsDraft(event.target.value.replace(/[^\d]/g, ""));
        }}
        onBlur={handleSecondsBlur}
        aria-label="Seconds"
        aria-invalid={invalid}
        className={cn("w-14 text-right tabular-nums", invalid && invalidInputClass)}
      />
      <UnitLabel>sec</UnitLabel>
    </div>
  );
}

type StepsInputProps = {
  value: string;
  onChange: (value: string) => void;
  "aria-labelledby"?: string;
};

export function StepsInput({ value, onChange, "aria-labelledby": labelledBy }: StepsInputProps) {
  const step = parseStepsString(value)?.[0] ?? { minutes: 1, seconds: 0 };

  const handleChange = (next: StepDuration) => {
    if (!isValidStepDuration(next)) return;
    const formatted = formatStepsString([next]);
    if (formatted) onChange(formatted);
  };

  return <DurationStepFields step={step} onChange={handleChange} labelledBy={labelledBy} />;
}

type StabilityFloorInputProps = {
  value: number;
  onChange: (value: number) => void;
  "aria-labelledby"?: string;
};

export function StabilityFloorInput({
  value,
  onChange,
  "aria-labelledby": labelledBy,
}: StabilityFloorInputProps) {
  const { draft, setDraft, invalid, setInvalid } = useSyncedDraft(value, String);

  const handleBlur = () => {
    const parsed = Number(draft);
    if (isValidStabilityFloor(parsed)) {
      setInvalid(false);
      setDraft(String(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(String(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="decimal"
        value={draft}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(/[^\d.]/g, ""));
        }}
        onBlur={handleBlur}
        aria-labelledby={labelledBy}
        aria-invalid={invalid}
        className={cn("w-16 text-right tabular-nums", invalid && invalidInputClass)}
      />
      <UnitLabel>days</UnitLabel>
    </div>
  );
}

type NewCardsPerDayInputProps = {
  value: number;
  onChange: (value: number) => void;
  "aria-labelledby"?: string;
};

export function NewCardsPerDayInput({
  value,
  onChange,
  "aria-labelledby": labelledBy,
}: NewCardsPerDayInputProps) {
  const { draft, setDraft, invalid, setInvalid } = useSyncedDraft(value, String);

  const handleBlur = () => {
    const parsed = parseBoundedInt(draft, NEW_CARDS_PER_DAY_MAX);
    if (parsed !== null && isValidNewCardsPerDay(parsed)) {
      setInvalid(false);
      setDraft(String(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(String(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(/[^\d]/g, ""));
        }}
        onBlur={handleBlur}
        aria-labelledby={labelledBy}
        aria-invalid={invalid}
        className={cn("w-16 text-right tabular-nums", invalid && invalidInputClass)}
      />
      <UnitLabel>review units</UnitLabel>
    </div>
  );
}

type ReviewsPerDayInputProps = {
  /** `null` means no daily limit. */
  value: number | null;
  onChange: (value: number | null) => void;
  "aria-labelledby"?: string;
};

const formatReviewsPerDay = (value: number | null) => (value == null ? "" : String(value));

export function ReviewsPerDayInput({
  value,
  onChange,
  "aria-labelledby": labelledBy,
}: ReviewsPerDayInputProps) {
  const [draft, setDraft] = useState(formatReviewsPerDay(value));
  const [invalid, setInvalid] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(formatReviewsPerDay(value));
    setInvalid(false);
  }

  const handleBlur = () => {
    if (draft.trim() === "") {
      setInvalid(false);
      setDraft("");
      onChange(null);
      return;
    }
    const parsed = parseBoundedInt(draft, REVIEWS_PER_DAY_MAX);
    if (parsed !== null && isValidReviewsPerDay(parsed)) {
      setInvalid(false);
      setDraft(String(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(formatReviewsPerDay(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        value={draft}
        placeholder="Unlimited"
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(/[^\d]/g, ""));
        }}
        onBlur={handleBlur}
        aria-labelledby={labelledBy}
        aria-invalid={invalid}
        className={cn("w-24 text-right tabular-nums", invalid && invalidInputClass)}
      />
      <UnitLabel>reviews</UnitLabel>
    </div>
  );
}
