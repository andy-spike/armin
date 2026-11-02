import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@armin/backend/api";
import { Section } from "@/components/settings-layout";
import { formatStorage, picturesIn } from "@/lib/storage-size";

/** The library's shared image and audio storage, split by kind. */
export function StorageUsage() {
  const usage = useQuery(convexQuery(api.media.usage, {})).data;
  const used = usage ? usage.imageBytes + usage.audioBytes : 0;
  const limit = usage?.limitBytes ?? 0;
  const share = (bytes: number) => (limit ? `${Math.min(100, (bytes / limit) * 100)}%` : "0%");
  const left = Math.max(0, limit - used);
  const pictures = picturesIn(left);

  return (
    <Section
      title="Storage"
      description="Images and audio share one storage space. Armin shrinks them before upload, so they take far less room than the original files."
      action={
        usage?.plan === "free" ? (
          <Link
            to="/pricing"
            className="text-[0.8125rem] font-medium text-accent hover:text-accent-deep"
          >
            See plans
          </Link>
        ) : undefined
      }
    >
      <div className="px-4 py-3.5">
        {usage ? (
          <>
            <p className="text-sm text-ink">
              <span className="font-medium tabular-nums">{formatStorage(used)}</span>
              <span className="text-muted"> of {formatStorage(limit)} used</span>
            </p>
            <div
              className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-border"
              role="meter"
              aria-label="Storage used"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={used}
              aria-valuetext={`${formatStorage(used)} of ${formatStorage(limit)}`}
            >
              <div className="h-full bg-accent" style={{ width: share(usage.imageBytes) }} />
              <div className="h-full bg-ink/45" style={{ width: share(usage.audioBytes) }} />
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-muted">
              <li className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent" aria-hidden />
                Images{" "}
                <span className="tabular-nums text-ink">{formatStorage(usage.imageBytes)}</span>
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-ink/45" aria-hidden />
                Audio{" "}
                <span className="tabular-nums text-ink">{formatStorage(usage.audioBytes)}</span>
              </li>
            </ul>
            <p className="mt-3 border-t border-border pt-3 text-[0.8125rem] text-muted">
              {left === 0
                ? "Your storage is full. Delete images or audio you no longer need to add more."
                : pictures > 0
                  ? `Room for about ${pictures.toLocaleString()} more pictures, or the same space in audio.`
                  : `${formatStorage(left)} left.`}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Loading storage…</p>
        )}
      </div>
    </Section>
  );
}
