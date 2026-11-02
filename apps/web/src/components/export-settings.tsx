import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Download, LoaderCircle } from "lucide-react";
import { api } from "@armin/backend/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { armin, errorMessage } from "@/lib/armin-client";
import {
  assembleExport,
  chooseExportSink,
  type ExportProgress,
  waitForExport,
} from "@/lib/library-export";
import { useConnection } from "@/lib/session";

function formatBytes(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type ActiveExport = {
  controller: AbortController;
  /** Null while the server prepares the card data. */
  progress: ExportProgress | null;
};

/**
 * The server prepares the card data; the browser then adds every image and
 * audio file and saves one ZIP (`lib/library-export.ts`). Prepared exports
 * expire after an hour, and the tab must stay open until saving finishes.
 */
export function ExportSettings() {
  const toast = useToast();
  const { online } = useConnection();
  const exportsQuery = useQuery(convexQuery(api.exports.list, {}));
  const rows = exportsQuery.data ?? [];
  const [includeAudio, setIncludeAudio] = useState(true);
  const [active, setActive] = useState<ActiveExport | null>(null);

  /** Start (or reuse a prepared) export, then add media and save the ZIP. */
  const run = async (exportId: string | null, fileName: string) => {
    const sink = await chooseExportSink(fileName);
    if (!sink) return;
    const controller = new AbortController();
    setActive({ controller, progress: null });
    try {
      const id = exportId ?? (await armin.exports.start({ includeAudio }));
      await waitForExport(id, controller.signal);
      await assembleExport({
        exportId: id,
        sink,
        signal: controller.signal,
        onProgress: (progress) => setActive((current) => current && { ...current, progress }),
      });
      toast({ tone: "success", title: "Export saved", description: fileName });
    } catch (error) {
      await sink.abort().catch(() => {});
      if (!controller.signal.aborted)
        toast({ tone: "error", title: "Export failed", description: errorMessage(error) });
    } finally {
      setActive(null);
    }
  };

  // Leaving the page would stop the download half-way.
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const progress = active?.progress;

  return (
    <div>
      <div className="flex items-start justify-between gap-6 px-4 py-3.5">
        <p className="text-[0.8125rem] leading-snug text-muted">
          One ZIP with JSON data, a manifest with checksums, and your images and audio. Keep this
          tab open until it's saved. Sign-in details are never included.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          busy={active != null}
          disabled={!online}
          onClick={() =>
            void run(null, `armin-library-${new Date().toISOString().slice(0, 10)}.zip`)
          }
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>
      <div className="flex items-center justify-between gap-6 border-t border-border px-4 py-2.5">
        <label htmlFor="export-include-audio" className="text-[0.8125rem] leading-snug text-muted">
          <span className="font-medium text-ink">Include audio</span>
          <span className="block">Turn this off for a smaller file.</span>
        </label>
        <Switch
          id="export-include-audio"
          checked={includeAudio}
          onCheckedChange={setIncludeAudio}
        />
      </div>
      {active && (
        <div className="border-t border-border px-4 py-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted" aria-hidden />
              {progress
                ? `Adding images and audio ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
                : "Preparing cards"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => active.controller.abort()}>
              Cancel
            </Button>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{
                width: progress?.total ? `${(progress.done / progress.total) * 100}%` : "0%",
              }}
            />
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="border-t border-border">
          {rows.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">
                {item.fileName}
                <span className="ml-2 text-xs text-muted">
                  {new Date(item.createdAt).toLocaleTimeString()}
                </span>
              </span>
              {item.status === "pending" && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> Preparing
                </span>
              )}
              {item.status === "failed" && (
                <span className="text-xs text-again">{item.error ?? "Failed"}</span>
              )}
              {item.status === "ready" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-accent hover:text-accent-deep"
                  disabled={active != null}
                  onClick={() => void run(item.id, item.fileName)}
                >
                  Download {formatBytes(item.size)}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
