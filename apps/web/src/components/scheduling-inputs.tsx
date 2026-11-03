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
function useSyncedDraft<T>(value: T, format: (value: T) => string) {
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

type SettingInputProps<T> = {
  value: T;
  onChange: (value: T) => void;
  "aria-labelledby"?: string;
};

/**
 * A number typed as text and committed on blur. `parse` returns the value to
 * commit, or `undefined` when the draft is invalid; an invalid draft resets to
 * the committed value and marks the field.
 */
function NumberSettingInput<T>({
  value,
  onChange,
  "aria-labelledby": labelledBy,
  format,
  parse,
  disallowed,
  inputMode = "numeric",
  width,
  unit,
  placeholder,
}: SettingInputProps<T> & {
  format: (value: T) => string;
  parse: (draft: string) => T | undefined;
  /** Characters removed as the user types. */
  disallowed: RegExp;
  inputMode?: "numeric" | "decimal";
  width: string;
  unit: string;
  placeholder?: string;
}) {
  const { draft, setDraft, invalid, setInvalid } = useSyncedDraft(value, format);

  const handleBlur = () => {
    const parsed = parse(draft);
    if (parsed !== undefined) {
      setInvalid(false);
      setDraft(format(parsed));
      onChange(parsed);
      return;
    }
    setInvalid(true);
    setDraft(format(value));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode={inputMode}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value.replace(disallowed, ""));
        }}
        onBlur={handleBlur}
        aria-labelledby={labelledBy}
        aria-invalid={invalid}
        className={cn(width, "text-right tabular-nums", invalid && invalidInputClass)}
      />
      <UnitLabel>{unit}</UnitLabel>
    </div>
  );
}

/** `parsed` when it is a number that passes `isValid`, otherwise `undefined`. */
function validNumber(parsed: number | null, isValid: (value: number) => boolean) {
  return parsed !== null && isValid(parsed) ? parsed : undefined;
}

export function RetentionInput(props: SettingInputProps<number>) {
  return (
    <NumberSettingInput
      {...props}
      format={formatRetentionPercent}
      parse={(draft) => validNumber(parseRetentionPercent(draft), isValidRetention)}
      disallowed={/[^\d]/g}
      width="w-16"
      unit="%"
    />
  );
}

export function MaximumIntervalInput(props: SettingInputProps<number>) {
  return (
    <NumberSettingInput
      {...props}
      format={formatDays}
      parse={(draft) => validNumber(parseDays(draft), isValidMaximumInterval)}
      disallowed={/[^\d,]/g}
      width="w-24"
      unit="days"
    />
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

export function StabilityFloorInput(props: SettingInputProps<number>) {
  return (
    <NumberSettingInput
      {...props}
      format={String}
      parse={(draft) => validNumber(Number(draft), isValidStabilityFloor)}
      disallowed={/[^\d.]/g}
      inputMode="decimal"
      width="w-16"
      unit="days"
    />
  );
}

export function NewCardsPerDayInput(props: SettingInputProps<number>) {
  return (
    <NumberSettingInput
      {...props}
      format={String}
      parse={(draft) =>
        validNumber(parseBoundedInt(draft, NEW_CARDS_PER_DAY_MAX), isValidNewCardsPerDay)
      }
      disallowed={/[^\d]/g}
      width="w-16"
      unit="review units"
    />
  );
}

const formatReviewsPerDay = (value: number | null) => (value == null ? "" : String(value));

/** `null` means no daily limit; an empty field commits it. */
export function ReviewsPerDayInput(props: SettingInputProps<number | null>) {
  return (
    <NumberSettingInput
      {...props}
      format={formatReviewsPerDay}
      parse={(draft) =>
        draft.trim() === ""
          ? null
          : validNumber(parseBoundedInt(draft, REVIEWS_PER_DAY_MAX), isValidReviewsPerDay)
      }
      disallowed={/[^\d]/g}
      width="w-24"
      unit="reviews"
      placeholder="Unlimited"
    />
  );
}
