import { checkParameters } from "ts-fsrs";
import { fail } from "./errors";

/** Shared validation for study and deck settings, including settings an import carries. */
export function checkSteps(value: string | null | undefined) {
  if (value == null) return;
  const steps = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (steps.some((step) => !/^\d+(?:\.\d+)?[mhd]$/.test(step))) {
    fail("INVALID", "Steps use units like 10m, 1h, or 1d separated by commas.");
  }
}

export function checkWeights(value: string | null | undefined) {
  if (value == null) return;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((n) => typeof n !== "number")) throw 0;
    checkParameters(parsed);
  } catch {
    fail("INVALID", "FSRS weights must be a JSON array of 17, 19, or 21 finite numbers.");
  }
}

const inRange = (value: number, min: number, max: number) => value >= min && value <= max;
const isWholeInRange = (value: number, min: number, max: number) =>
  Number.isInteger(value) && inRange(value, min, max);

export function checkRanges(patch: {
  requestRetention?: number | null;
  maximumInterval?: number | null;
  prereqStabilityFloor?: number | null;
  newReviewUnitsPerDay?: number | null;
  reviewsPerDay?: number | null;
}) {
  const { requestRetention, maximumInterval, prereqStabilityFloor } = patch;
  const { newReviewUnitsPerDay, reviewsPerDay } = patch;
  if (requestRetention != null && !inRange(requestRetention, 0.7, 0.99)) {
    fail("INVALID", "Desired retention must be between 0.70 and 0.99.");
  }
  if (maximumInterval != null && !isWholeInRange(maximumInterval, 1, 36500)) {
    fail("INVALID", "Maximum interval must be 1–36500 days.");
  }
  if (prereqStabilityFloor != null && !inRange(prereqStabilityFloor, 0, 365)) {
    fail("INVALID", "Prerequisite stability floor must be 0–365 days.");
  }
  if (newReviewUnitsPerDay != null && !isWholeInRange(newReviewUnitsPerDay, 0, 1000)) {
    fail("INVALID", "New review units per day must be 0–1000.");
  }
  if (reviewsPerDay != null && !isWholeInRange(reviewsPerDay, 0, 1000)) {
    fail("INVALID", "Reviews per day must be 0–1000, or empty for no limit.");
  }
}
