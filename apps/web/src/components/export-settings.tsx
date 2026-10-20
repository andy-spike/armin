import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Download, LoaderCircle } from "lucide-react";
import { api } from "@armin/backend/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { armin, errorMessage } from "@/lib/armin-client";
import { useConnection } from "@/lib/session";

function formatBytes(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Starts a server-side export job and lists recent exports. Finished ZIPs are
 * downloaded through the same-origin authenticated route and expire after an
 * hour.
 */
export function ExportSettings() {
  const toast = useToast();
  const { online } = useConnection();
  const exportsQuery = useQuery(convexQuery(api.exports.list, {}));
  const rows = exportsQuery.data ?? [];
  const pending = rows.some((row) => row.status === "pending");

  const start = useMutation({
    mutationFn: () => armin.exports.start(),
    onError: (error) =>
      toast({ tone: "error", title: "Couldn't start export", description: errorMessage(error) }),
  });

  return (
    <div>
      <div className="flex items-start justify-between gap-6 px-4 py-3.5">
        <p className="text-[0.8125rem] leading-snug text-muted">
          A versioned ZIP with JSON data, a manifest with checksums, and your images. Sign-in
          details are never included.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          busy={start.isPending || pending}
          disabled={!online}
          onClick={() => start.mutate()}
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>
      {rows.length > 0 && (
        <ul className="border-t border-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">
                {row.fileName}
                <span className="ml-2 text-xs text-muted">
                  {new Date(row.createdAt).toLocaleTimeString()}
                </span>
              </span>
              {row.status === "pending" && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> Preparing
                </span>
              )}
              {row.status === "failed" && (
                <span className="text-xs text-again">{row.error ?? "Failed"}</span>
              )}
              {row.status === "ready" && (
                <a
                  href={`/api/export/${row.id}`}
                  download={row.fileName}
                  className="shrink-0 text-sm font-medium text-accent hover:text-accent-deep"
                >
                  Download {formatBytes(row.size)}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
