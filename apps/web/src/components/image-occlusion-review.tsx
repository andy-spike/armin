import { useCallback, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { ImageOcclusionContent, ImageOcclusionMask } from "@armin/core/flashcard-types";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { mediaDisplayUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

type MaskLook = "question" | "hidden" | "revealed" | "outline" | "none";

const MASK_CLASSES: Record<Exclude<MaskLook, "none">, string> = {
  question: "bg-accent text-on-accent ring-2 ring-inset ring-accent-deep",
  hidden:
    "bg-[color-mix(in_srgb,var(--armin-ink)_16%,var(--armin-surface))] ring-1 ring-inset ring-[color-mix(in_srgb,var(--armin-ink)_38%,var(--armin-surface))]",
  revealed:
    "bg-accent/10 ring-[3px] ring-accent shadow-[0_0_0_5px_color-mix(in_srgb,var(--armin-surface)_55%,transparent)]",
  outline: "bg-accent/15 ring-2 ring-inset ring-accent text-ink",
};

const percent = (value: number) => `${value * 100}%`;

const boxesOf = (mask: ImageOcclusionMask) => mask.parts ?? [mask.geometry];

export function OcclusionImage({
  src,
  masks,
  lookOf,
  maxHeight,
  labelOf,
  className,
  alt = "Occlusion image",
}: {
  src: string;
  masks: ImageOcclusionMask[];
  lookOf: (mask: ImageOcclusionMask) => MaskLook;
  maxHeight: string;
  labelOf?: (mask: ImageOcclusionMask) => string | null;
  className?: string;
  alt?: string;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const measure = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) {
      setRatio(image.naturalWidth / image.naturalHeight);
    }
  }, []);

  return (
    <div
      className={cn(
        "relative max-w-full overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border-strong",
        !ratio && "w-full",
        className,
      )}
      style={
        ratio
          ? { aspectRatio: String(ratio), width: `min(100%, calc(${maxHeight} * ${ratio}))` }
          : { height: `min(${maxHeight}, 16rem)` }
      }
    >
      <img
        ref={measure}
        src={mediaDisplayUrl(src)}
        alt={alt}
        draggable={false}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalWidth > 0) setRatio(image.naturalWidth / image.naturalHeight);
        }}
        onError={() => setFailed(true)}
        className={cn("absolute inset-0 block size-full select-none", !ratio && "opacity-0")}
      />
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-4 text-sm text-muted">
          This image couldn&apos;t be loaded.
        </p>
      )}
      {ratio &&
        masks.map((mask) => {
          const look = lookOf(mask);
          if (look === "none") return null;
          const label = labelOf?.(mask);
          return boxesOf(mask).map((box, index) => (
            <div
              key={`${mask.id}-${index}`}
              aria-hidden
              className={cn(
                "pointer-events-none absolute grid place-items-center rounded-[3px] font-semibold leading-none [container-type:size]",
                MASK_CLASSES[look],
              )}
              style={{
                left: percent(box.x),
                top: percent(box.y),
                width: percent(box.w),
                height: percent(box.h),
              }}
            >
              {label &&
                index === 0 &&
                (look === "outline" ? (
                  <span
                    className={cn(
                      "absolute left-0 bg-accent px-1 py-0.5 text-[0.625rem] text-on-accent tabular-nums",
                      box.y > 0.05 ? "bottom-full rounded-t-[3px]" : "top-full rounded-b-[3px]",
                    )}
                  >
                    {label}
                  </span>
                ) : (
                  <span className="text-[clamp(0.5rem,min(60cqh,40cqw),1.5rem)]">{label}</span>
                ))}
            </div>
          ));
        })}
    </div>
  );
}

export function ImageOcclusionReview({
  content,
  targetId,
  flipped,
}: {
  content: ImageOcclusionContent;
  targetId: string;
  flipped: boolean;
}) {
  const [showContext, setShowContext] = useState(true);
  const target = content.masks.find((mask) => mask.id === targetId);
  const hideAll = content.revealMode === "hide_all";
  const lookOf = (mask: ImageOcclusionMask): MaskLook => {
    if (mask.id === targetId) return flipped ? "revealed" : "question";
    return hideAll && (!flipped || showContext) ? "hidden" : "none";
  };

  return (
    <div className="flex w-full flex-col items-center">
      {content.header && (
        <MarkdownContent
          imageLoading="eager"
          content={content.header}
          className="mb-4 max-w-[52ch] text-pretty text-lg font-medium leading-snug text-ink"
        />
      )}
      <OcclusionImage
        src={content.baseImage}
        masks={content.masks}
        lookOf={lookOf}
        labelOf={(mask) => (mask.id === targetId && !flipped ? "?" : null)}
        maxHeight="max(12rem, min(100dvh - 27rem, 44rem))"
        alt={content.header ? "Occlusion image" : "Occlusion image with hidden labels"}
      />
      {!flipped && (
        <p className="mt-4 text-sm text-muted">
          {target?.hint ? `What is hidden here? (${target.hint})` : "What is hidden here?"}
        </p>
      )}
      {flipped && (
        <div className="mt-3 flex w-full max-w-[60ch] flex-col items-center gap-3">
          {hideAll && content.masks.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setShowContext((show) => !show)}>
              {showContext ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {showContext ? "Hide other masks" : "Show other masks"}
            </Button>
          )}
          {target?.label && <p className="text-lg font-medium text-ink">{target.label}</p>}
          {content.extra && (
            <MarkdownContent
              imageLoading="eager"
              content={content.extra}
              className="text-pretty text-sm leading-relaxed text-muted"
            />
          )}
        </div>
      )}
    </div>
  );
}

export function ImageOcclusionPreview({
  content,
  maxHeight,
  numbered = true,
  className,
}: {
  content: ImageOcclusionContent;
  maxHeight: string;
  numbered?: boolean;
  className?: string;
}) {
  const numbers = new Map(content.masks.map((mask, index) => [mask.id, String(index + 1)]));
  return (
    <OcclusionImage
      src={content.baseImage}
      masks={content.masks}
      lookOf={() => (numbered ? "outline" : "hidden")}
      labelOf={numbered ? (mask) => numbers.get(mask.id) ?? null : undefined}
      maxHeight={maxHeight}
      className={className}
    />
  );
}
