import { createScheduler } from "@armin/core/scheduler";
import type { FSRS } from "ts-fsrs";
import { getSettings } from "./settings";
import type { SchedulingSettings } from "./settings";
import type { ServiceContext } from "./context";

/** Build an FSRS scheduler from the profile's saved (or given) settings. */
export async function buildScheduler(
  ctx: ServiceContext,
  settings?: SchedulingSettings,
): Promise<FSRS> {
  return createScheduler(settings ?? (await getSettings(ctx)));
}
