import { useCallback } from "react";
import type { ImageOcclusionContent } from "@armin/core/flashcard-types";
import { Field } from "@/components/flashcard-form-fields";
import { ImageOcclusionPreview } from "@/components/image-occlusion-review";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { plural } from "@/lib/utils";

/**
 * The editor's view of an image occlusion card. Masks can't be drawn or moved
 * here yet, so the card is shown read-only and saving keeps it unchanged.
 */
export function ImageOcclusionFields({ content }: { content: ImageOcclusionContent | null }) {
  // The dialog focuses its first input, the tags here, which would open it
  // scrolled past the image. Take initial focus at the top instead.
  const focusOnMount = useCallback((node: HTMLDivElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);
  if (!content) return null;
  const count = content.masks.length;
  return (
    <div ref={focusOnMount} tabIndex={-1} className="space-y-4 outline-none">
      <Field
        label="Image and masks"
        hint={`${plural(count, "mask")} · ${
          content.revealMode === "hide_all" ? "Hide all, guess one" : "Hide one, guess one"
        }`}
      >
        <div className="flex justify-center rounded-md border border-border bg-bg-2 p-3">
          <ImageOcclusionPreview content={content} maxHeight="min(48vh, 28rem)" />
        </div>
      </Field>
      {content.header && (
        <Field label="Header">
          <MarkdownContent content={content.header} className="text-sm text-ink" />
        </Field>
      )}
      {content.extra && (
        <Field label="Extra" hint="Shown with the answer.">
          <MarkdownContent content={content.extra} className="text-sm text-ink" />
        </Field>
      )}
      <p className="text-xs text-muted">
        Masks, header, and extra can&apos;t be edited here yet. Saving keeps them as they are and
        updates the tags.
      </p>
    </div>
  );
}
