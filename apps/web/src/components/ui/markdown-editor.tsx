import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import {
  editorViewCtx,
  editorViewOptionsCtx,
  serializerCtx,
  remarkStringifyOptionsCtx,
} from "@milkdown/kit/core";
import { replaceAll, insert } from "@milkdown/kit/utils";
import { paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { TextSelection } from "@milkdown/kit/prose/state";
import { MAX_MEDIA_FILE_BYTES, MIME_BY_EXT } from "@armin/core/media";
import { hasMath, splitMath } from "@armin/core/math";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { cn } from "@/lib/utils";
import {
  mediaDisplayUrl,
  persistMediaRefsInMarkdown,
  resolveMediaRefsInMarkdown,
} from "@/lib/media";
import { ImageZoomDialog } from "@/components/ui/image-zoom-dialog";
import { MarkdownContent } from "@/components/ui/markdown-content";
import {
  MarkdownEditorToolbar,
  NO_FORMATS,
  readFormats,
  sameFormats,
} from "@/components/ui/markdown-editor-toolbar";
import { configureCardImages } from "@/components/ui/markdown-image";
import { useToast } from "@/components/ui/toast";
import { armin } from "@/lib/armin-client";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

// SVG is intentionally not offered: uploaded images are served from an
// authenticated route, and SVG can carry script. The server sniffs uploaded
// bytes and rejects it too; keeping the picker honest avoids a pointless round
// trip. Derive the rest from the shared media rules so the two stay in sync.
const UPLOAD_MIME_TYPES = Object.values(MIME_BY_EXT).filter((mime) => mime !== MIME_BY_EXT.svg);
const UPLOAD_ACCEPT = UPLOAD_MIME_TYPES.join(",");
const MAX_UPLOAD_MB = Math.round(MAX_MEDIA_FILE_BYTES / (1024 * 1024));
const UNSUPPORTED_IMAGE_MESSAGE = "Use a PNG, JPG, GIF, WebP, BMP, or AVIF image.";
const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

/** Turn an upload failure into the most specific message we can. */
function uploadErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/network|fetch|connection|aborted|EPIPE/i.test(error.message)) {
      return NETWORK_ERROR_MESSAGE;
    }
    if (error.message.trim()) return error.message;
  }
  return "The image upload failed.";
}

function megabytes(bytes: number) {
  return Math.max(1, Math.round(bytes / (1024 * 1024)));
}

// Preserve imported HTML and legacy equation delimiters literally. Dollar math
// and GFM tables can be edited visually in Crepe.
function needsSourceMode(value: string) {
  const prose = value.replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1/g, "").replace(/`+[^`]*`+/g, "");
  if (
    /<!--|<!DOCTYPE|<\/?[a-z][\w-]*(?:\s[^>]*|\/?)>/i.test(prose) ||
    /\[(?:\$|latex)/i.test(prose) ||
    /(?:```|~~~)\s*latex\b/i.test(value)
  )
    return true;
  if (/\$\d/.test(prose)) return true;
  let offset = 0;
  return splitMath(value).some((part) => {
    const start = offset;
    offset += part.raw.length;
    if (part.kind !== "math") return false;
    if (!part.raw.startsWith("$")) return true;
    if (!part.display) return false;
    // A display block can only be expanded when it occupies its own lines.
    const before = value.slice(0, start).split("\n").at(-1) ?? "";
    const after = value.slice(offset).split("\n")[0];
    return before.trim().length > 0 || after.trim().length > 0;
  });
}

function editorMarkdown(value: string) {
  return resolveMediaRefsInMarkdown(
    splitMath(value)
      .map((part) =>
        part.kind === "math" && part.display ? `$$\n${part.tex.trim()}\n$$` : part.raw,
      )
      .join(""),
  );
}

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onUploadChange?: (delta: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function MarkdownEditor({
  value,
  onChange,
  onUploadChange,
  placeholder,
  autoFocus,
  className,
  "aria-label": ariaLabel,
}: MarkdownEditorProps) {
  const toast = useToast();
  const alive = useRef(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const latest = useRef({ value, onChange });
  const emitted = useRef<string | null>(null);
  const replacing = useRef(false);
  const loaded = useRef(value);
  const [source, setSource] = useState(() => needsSourceMode(value));
  // Switching between rich text and source keeps the box at least as tall as
  // it was, so the page doesn't jump when the two modes wrap text differently.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [switchHeight, setSwitchHeight] = useState<number | null>(null);
  const holdHeight = () => setSwitchHeight(bodyRef.current?.offsetHeight ?? null);
  const sourceMode = useRef(source);
  const [uploading, setUploading] = useState(0);
  useLayoutEffect(() => {
    sourceMode.current = source;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [formats, setFormats] = useState(NO_FORMATS);
  useLayoutEffect(() => {
    latest.current = { value, onChange };
  });

  const upload = async (file: File) => {
    onUploadChange?.(1);
    setUploading((count) => count + 1);
    try {
      if (!UPLOAD_MIME_TYPES.includes(file.type)) throw new Error(UNSUPPORTED_IMAGE_MESSAGE);
      if (file.size > MAX_MEDIA_FILE_BYTES)
        throw new Error(
          `That image is ${megabytes(file.size)} MB. Images must be ${MAX_UPLOAD_MB} MB or smaller.`,
        );
      const stored = await armin.media.importImage({ file, fileName: file.name });
      if (!alive.current)
        throw new Error("The card editor was closed before the upload completed.");
      return mediaDisplayUrl(stored.ref);
    } catch (error) {
      toast({ tone: "error", title: "Image not added", description: uploadErrorMessage(error) });
      throw error;
    } finally {
      onUploadChange?.(-1);
      if (alive.current) setUploading((count) => count - 1);
    }
  };
  const uploadRef = useRef(upload);
  useLayoutEffect(() => {
    uploadRef.current = upload;
  });

  useEffect(() => {
    if (source || !hostRef.current) return;
    let disposed = false;
    let loading = true;
    const root = document.createElement("div");
    hostRef.current.append(root);
    const crepe = new Crepe({
      root,
      defaultValue: editorMarkdown(latest.current.value),
      // Armin draws its own fixed toolbar in place of Crepe's selection popup.
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: placeholder ?? "", mode: "doc" },
        [Crepe.Feature.ImageBlock]: { onUpload: (file) => uploadRef.current(file) },
      },
    });
    crepe.editor.config((ctx) => {
      configureCardImages(ctx, setPreview);
      // Empty paragraphs are layout only; Armin does not render raw HTML.
      ctx.update(paragraphSchema.key, (previous) => (context) => {
        const schema = previous(context);
        return {
          ...schema,
          toMarkdown: {
            ...schema.toMarkdown,
            runner(state, node) {
              if (node.content.size > 0) schema.toMarkdown.runner(state, node);
            },
          },
        };
      });
      ctx.update(remarkStringifyOptionsCtx, (options) => ({
        ...options,
        handlers: {
          ...options.handlers,
          text(node, _parent, state, info) {
            const safe = state.safe(node.value, info);
            return node.value.includes(" ") ? safe.replace(/&#x20;/g, " ") : safe;
          },
        },
      }));
      ctx.update(editorViewOptionsCtx, (options) => ({
        ...options,
        attributes: {
          class: "markdown-content",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel ?? "Card content",
        },
        dispatchTransaction(transaction) {
          const view = ctx.get(editorViewCtx);
          const previous = view.state.doc;
          view.updateState(view.state.apply(transaction));
          if (!disposed) {
            const next = readFormats(ctx, view.state);
            setFormats((current) => (sameFormats(current, next) ? current : next));
          }
          if (!disposed && !loading && !replacing.current && !previous.eq(view.state.doc)) {
            const next = persistMediaRefsInMarkdown(ctx.get(serializerCtx)(view.state.doc));
            emitted.current = next;
            latest.current.value = next;
            latest.current.onChange(next);
          }
        },
        handleKeyDown: (_view, event) => event.key === "Enter" && (event.ctrlKey || event.metaKey),
      }));
    });
    const creating = crepe
      .create()
      .then(() => {
        if (disposed) return;
        crepeRef.current = crepe;
        loaded.current = latest.current.value;
        loading = false;
        setReady(true);
        if (autoFocus)
          requestAnimationFrame(() => {
            if (!disposed) crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
          });
      })
      .catch(() => {
        if (!disposed) setSource(true);
      });
    return () => {
      disposed = true;
      root.remove();
      crepeRef.current = null;
      void creating.then(() => crepe.destroy());
    };
  }, [source, placeholder, autoFocus, ariaLabel]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Escape closes an open link or equation popover, not the whole dialog.
    const closePopover = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!root.querySelector('.milkdown [data-show="true"]')) return;
      event.stopPropagation();
      crepeRef.current?.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const end = view.state.doc.resolve(view.state.selection.to);
        view.dispatch(view.state.tr.setSelection(TextSelection.near(end)));
        view.focus();
      });
    };
    root.addEventListener("keydown", closePopover);
    return () => root.removeEventListener("keydown", closePopover);
  }, []);

  useEffect(() => {
    if (source || !ready || value === emitted.current || value === loaded.current) return;
    if (needsSourceMode(value)) {
      // oxlint-disable-next-line react/set-state-in-effect -- external content may require lossless source editing
      setSource(true);
      return;
    }
    const crepe = crepeRef.current;
    if (crepe && persistMediaRefsInMarkdown(crepe.getMarkdown()) !== value) {
      replacing.current = true;
      crepe.editor.action(replaceAll(editorMarkdown(value)));
      replacing.current = false;
      loaded.current = value;
      if (autoFocus) crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
    }
  }, [value, source, ready, autoFocus]);

  const insertImages = async (files: File[]) => {
    for (const file of files) {
      try {
        const src = await uploadRef.current(file);
        const markdown = persistMediaRefsInMarkdown(
          `![${file.name.replace(/[[\]\\]/g, "")}](${src})`,
        );
        if (!alive.current) return;
        if (sourceMode.current) {
          const current = latest.current.value;
          const start = sourceRef.current?.selectionStart ?? current.length;
          const end = sourceRef.current?.selectionEnd ?? start;
          const next = current.slice(0, start) + markdown + current.slice(end);
          latest.current.value = next;
          latest.current.onChange(next);
          requestAnimationFrame(() => {
            sourceRef.current?.focus();
            sourceRef.current?.setSelectionRange(start + markdown.length, start + markdown.length);
          });
        } else {
          crepeRef.current?.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            // Move past a selected image rather than replacing it on the next upload.
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.near(view.state.doc.resolve(view.state.selection.to)),
              ),
            );
            insert(resolveMediaRefsInMarkdown(markdown))(ctx);
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.near(view.state.doc.resolve(view.state.selection.to), 1),
              ),
            );
          });
        }
      } catch {
        /* Upload already reports a specific error. */
      }
    }
  };

  return (
    <div
      className={cn(
        "card-markdown-editor group/editor rounded-md border border-border-strong bg-surface focus-within:border-accent",
        className,
      )}
      ref={rootRef}
    >
      <MarkdownEditorToolbar
        formats={formats}
        source={source}
        disabled={!source && !ready}
        uploading={uploading > 0}
        onCommand={(command) => crepeRef.current?.editor.action(command)}
        onAddImage={() => fileRef.current?.click()}
        onEditSource={() => {
          holdHeight();
          setSource(true);
        }}
        onRichText={() => {
          holdHeight();
          setReady(false);
          setFormats(NO_FORMATS);
          setSource(false);
        }}
        richTextBlocked={source && needsSourceMode(value)}
      />
      <div
        ref={bodyRef}
        style={switchHeight ? { minHeight: switchHeight } : undefined}
        className="flex min-h-[88px] flex-col px-3 py-2 text-sm leading-relaxed text-ink"
        {...(autoFocus ? { "data-autofocus": true } : {})}
      >
        {source ? (
          <AutoGrowTextarea
            ref={sourceRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoFocus={autoFocus}
            minHeight={72}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className="flex-1 resize-none border-0 bg-transparent px-0 py-0 font-mono text-xs focus-visible:ring-0"
          />
        ) : (
          <>
            {!ready && (
              <div aria-busy>
                <MarkdownContent content={value} />
              </div>
            )}
            <div
              ref={hostRef}
              style={!ready ? { visibility: "hidden", height: 0, overflow: "hidden" } : undefined}
            />
          </>
        )}
      </div>
      {uploading > 0 && (
        <p role="status" className="px-3 py-1 text-xs text-muted">
          Uploading image…
        </p>
      )}
      {source && hasMath(value) && (
        <div className="border-t border-border px-3 py-2">
          <MarkdownContent content={value} />
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          void insertImages(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <ImageZoomDialog src={preview} open={preview !== null} onClose={() => setPreview(null)} />
    </div>
  );
}
