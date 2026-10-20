import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";

/**
 * Keeps cached study reads fresh across tabs and devices. It subscribes to
 * the library's write revision (a reactive Convex query) and refreshes the
 * screen's data when any client changes the library. Forms and the review
 * on screen hold their own state, so a refresh never replaces a draft or the
 * prompt being answered.
 */
export function LibrarySync() {
  const queryClient = useQueryClient();
  const revision = useQuery({ ...convexQuery(api.account.revision, {}), retry: false });
  const last = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (revision.data === undefined) return;
    if (last.current !== undefined && last.current !== revision.data) {
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "convexQuery",
      });
    }
    last.current = revision.data;
  }, [queryClient, revision.data]);

  return null;
}
