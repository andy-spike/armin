import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { reviewStatusQuery } from "@/lib/queries";
import { scheduleStudyClock, useStudyClock } from "@/lib/study-clock";

export function StudyClockSync() {
  const status = useQuery(reviewStatusQuery(useStudyClock()));
  const refreshAt = status.data?.refreshAt;
  useEffect(() => {
    if (refreshAt != null) scheduleStudyClock(refreshAt);
  }, [refreshAt]);
  return null;
}
