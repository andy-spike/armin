import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { reviewStatusQuery } from "@/lib/queries";
import { scheduleStudyClock, useStudyClock } from "@/lib/study-clock";

/**
 * Advances the study clock when the server says time alone next changes a
 * due count, so time-dependent subscriptions re-run then (lib/study-clock.ts).
 * Shares its subscription with the sidebar's due badge.
 */
export function StudyClockSync() {
  const status = useQuery(reviewStatusQuery(useStudyClock()));
  const refreshAt = status.data?.refreshAt;
  useEffect(() => {
    if (refreshAt != null) scheduleStudyClock(refreshAt);
  }, [refreshAt]);
  return null;
}
