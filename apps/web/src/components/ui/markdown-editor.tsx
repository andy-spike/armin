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
import type { EditorView } from "@milkdown/kit/prose/view";
import { AUDIO_MIME_BY_EXT, IMAGE_MIME_BY_EXT } from "@armin/core/media";
import { MAX_DEVICE_MEDIA_BYTES } from "@/lib/shrink-media";
import { hasInlineMarks } from "@/lib/markdown-marks";
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
import { ClozeChipPopover, type ClozeChip } from "@/components/ui/cloze-chip-popover";
import {
  clozeNeedsSource,
  clozePlugins,
  clozeRangeAt,
  clozeStringifyHandler,
  removeCloze,
  toggleCloze,
  typeIntoCloze,
  updateCloze,
} from "@/components/ui/markdown-cloze";
import { armin } from "@/lib/armin-client";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

const UPLOAD_MIME_TYPES = Object.values(IMAGE_MIME_BY_EXT).filter(
  (mime) => mime !== IMAGE_MIME_BY_EXT.svg,
);
const UPLOAD_ACCEPT = UPLOAD_MIME_TYPES.join(",");
const AUDIO_ACCEPT = [
  ...Object.values(AUDIO_MIME_BY_EXT),
  ".mp3",
  ".ogg",
  ".oga",
  ".opus",
  ".m4a",
  ".wav",
  ".flac",
  ".aac",
].join(",");
const UNSUPPORTED_IMAGE_MESSAGE = "Use a PNG, JPG, GIF, WebP, BMP, or AVIF image.";
const UNSUPPORTED_AUDIO_MESSAGE = "Use an MP3, OGG, M4A, WAV, FLAC, or AAC audio file.";
const AUDIO_REF_RE = new RegExp(
  `!\\[[^\\]]*\\]\\((?:armin-media:|/media/)[a-f0-9]{64}\\.(?:${Object.keys(AUDIO_MIME_BY_EXT).join("|")})\\)`,
);
const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

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

function needsSourceMode(value: string) {
  const prose = value.replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1/g, "").replace(/`+[^`]*`+/g, "");
  if (
    /<!--|<!DOCTYPE|<\/?[a-z][\w-]*(?:\s[^>]*|\/?)>/i.test(prose) ||
    /\[(?:\$|latex)/i.test(prose) ||
    /(?:```|~~~)\s*latex\b/i.test(value)
  )
    return true;
  const outsideMath = splitMath(prose)
    .flatMap((part) => (part.kind === "text" ? [part.raw] : []))
    .join(" ");
  if (/\$\d/.test(outsideMath)) return true;
  if (AUDIO_REF_RE.test(value) || hasInlineMarks(value)) return true;
  let offset = 0;
  return splitMath(value).some((part) => {
    const start = offset;
    offset += part.raw.length;
    if (part.kind !== "math") return false;
    if (!part.raw.startsWith("$")) return true;
    if (!part.display) return false;
    const before = value.slice(0, start).split("\n").at(-1) ?? "";
    const after = value.slice(offset).split("\n")[0];
    return before.trim().length > 0 || after.trim().length > 0;
  });
}

function needsSource(value: string, cloze: boolean) {
  return needsSourceMode(value) || (cloze && clozeNeedsSource(value));
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
  cloze?: boolean;
  textOnly?: boolean;
  tall?: boolean;
};

export function MarkdownEditor({
  value,
  onChange,
  onUploadChange,
  placeholder,
  autoFocus,
  className,
  "aria-label": ariaLabel,
  cloze = false,
  textOnly = false,
  tall = false,
}: MarkdownEditorProps) {
  const toast = useToast();
  const alive = useRef(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const latest = useRef({ value, onChange });
  const emitted = useRef<string | null>(null);
  const replacing = useRef(false);
  const loaded = useRef(value);
  const [source, setSource] = useState(() => needsSource(value, cloze));
  const [chip, setChip] = useState<(ClozeChip & { from: number }) | null>(null);
  const [focusWithin, setFocusWithin] = useState(false);
  const [shownChip, setShownChip] = useState<(ClozeChip & { from: number }) | null>(null);
  const chipOpen = Boolean(cloze && chip && focusWithin && !source);
  if (chipOpen && chip !== shownChip) setShownChip(chip);
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

  const upload = async (file: File, kind: "image" | "audio" = "image") => {
    onUploadChange?.(1);
    setUploading((count) => count + 1);
    const noun = kind === "image" ? "image" : "audio file";
    try {
      if (kind === "image" && !UPLOAD_MIME_TYPES.includes(file.type))
        throw new Error(UNSUPPORTED_IMAGE_MESSAGE);
      if (kind === "audio" && file.type && !file.type.startsWith("audio/"))
        throw new Error(UNSUPPORTED_AUDIO_MESSAGE);
      if (file.size > MAX_DEVICE_MEDIA_BYTES)
        throw new Error(
          `That ${noun} is ${megabytes(file.size)} MB. Files must be ${megabytes(MAX_DEVICE_MEDIA_BYTES)} MB or smaller.`,
        );
      const stored = await armin.media.upload({ file, fileName: file.name });
      if (!alive.current)
        throw new Error("The card editor was closed before the upload completed.");
      return mediaDisplayUrl(stored.ref);
    } catch (error) {
      toast({
        tone: "error",
        title: kind === "image" ? "Image not added" : "Audio not added",
        description: uploadErrorMessage(error),
      });
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

  const chipAt = (view: EditorView) => {
    const { from, to } = view.state.selection;
    const range = clozeRangeAt(view.state, from);
    const root = rootRef.current;
    if (!range || to > range.to || !root) return null;
    const start = view.coordsAtPos(range.from);
    const frame = root.getBoundingClientRect();
    return {
      from: range.from,
      cluster: range.mark.attrs.cluster as number | null,
      hint: range.mark.attrs.hint as string | null,
      top: start.bottom - frame.top + 6,
      left: Math.max(4, Math.min(start.left - frame.left - 4, frame.width - 330)),
    };
  };

  useEffect(() => {
    if (source || !hostRef.current) return;
    let disposed = false;
    let loading = true;
    const root = document.createElement("div");
    hostRef.current.append(root);
    const crepe = new Crepe({
      root,
      defaultValue: editorMarkdown(latest.current.value),
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.AI]: false,
        ...(textOnly ? { [Crepe.Feature.ImageBlock]: false } : {}),
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: placeholder ?? "", mode: "doc" },
        [Crepe.Feature.Cursor]: { virtual: false },
        [Crepe.Feature.ImageBlock]: { onUpload: (file) => uploadRef.current(file) },
      },
    });
    if (cloze) crepe.editor.use(clozePlugins);
    crepe.editor.config((ctx) => {
      if (!textOnly) configureCardImages(ctx, setPreview);
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
          ...(cloze ? { cloze: clozeStringifyHandler as never } : {}),
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
            if (cloze) setChip(chipAt(view));
          }
          if (!disposed && !loading && !replacing.current && !previous.eq(view.state.doc)) {
            const next = persistMediaRefsInMarkdown(ctx.get(serializerCtx)(view.state.doc));
            emitted.current = next;
            latest.current.value = next;
            latest.current.onChange(next);
          }
        },
        handleTextInput: (view, from, to, text) => cloze && typeIntoCloze(view, from, to, text),
        handleKeyDown: (view, event) => {
          if (
            cloze &&
            (event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === "c"
          ) {
            event.preventDefault();
            return toggleCloze(view);
          }
          return event.key === "Enter" && (event.ctrlKey || event.metaKey);
        },
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
  }, [source, placeholder, autoFocus, ariaLabel, cloze, textOnly]);

  const withChip = (apply: (view: EditorView) => void) =>
    crepeRef.current?.editor.action((ctx) => apply(ctx.get(editorViewCtx)));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
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
    if (needsSource(value, cloze)) {
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
  }, [value, source, ready, autoFocus, cloze]);

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
      } catch {}
    }
  };

  const insertAudio = async (files: File[]) => {
    for (const file of files) {
      try {
        const src = await uploadRef.current(file, "audio");
        const markdown = persistMediaRefsInMarkdown(`![audio](${src})`);
        if (!alive.current) return;
        const current = latest.current.value;
        let next: string;
        if (sourceMode.current) {
          const start = sourceRef.current?.selectionStart ?? current.length;
          const end = sourceRef.current?.selectionEnd ?? start;
          next = current.slice(0, start) + markdown + current.slice(end);
        } else {
          next = current.trim() ? `${current.trimEnd()}\n\n${markdown}` : markdown;
          holdHeight();
          setSource(true);
        }
        latest.current.value = next;
        latest.current.onChange(next);
      } catch {}
    }
  };

  return (
    <div
      className={cn(
        "card-markdown-editor group/editor relative rounded-md border border-border-strong bg-surface focus-within:border-accent",
        className,
      )}
      ref={rootRef}
      data-tall={tall || undefined}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
    >
      <MarkdownEditorToolbar
        formats={formats}
        source={source}
        disabled={!source && !ready}
        uploading={uploading > 0}
        onCommand={(command) => crepeRef.current?.editor.action(command)}
        onAddImage={textOnly ? undefined : () => fileRef.current?.click()}
        onAddAudio={textOnly ? undefined : () => audioFileRef.current?.click()}
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
        richTextBlocked={source && needsSource(value, cloze)}
        onCloze={cloze ? () => withChip((view) => void toggleCloze(view)) : undefined}
      />
      <div
        ref={bodyRef}
        style={switchHeight ? { minHeight: switchHeight } : undefined}
        className={cn(
          "flex flex-col px-3 py-2 text-sm leading-relaxed text-ink",
          tall ? "min-h-44" : "min-h-[88px]",
        )}
        {...(autoFocus ? { "data-autofocus": true } : {})}
      >
        {source ? (
          <AutoGrowTextarea
            ref={sourceRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoFocus={autoFocus}
            minHeight={tall ? 160 : 72}
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
          Uploading…
        </p>
      )}
      {source && (hasMath(value) || hasInlineMarks(value) || AUDIO_REF_RE.test(value)) && (
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
      <input
        ref={audioFileRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          void insertAudio(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      {shownChip && (
        <ClozeChipPopover
          key={shownChip.from}
          chip={shownChip}
          leaving={!chipOpen}
          onExited={() => setShownChip(null)}
          onCluster={(cluster) =>
            withChip((view) => {
              const range = clozeRangeAt(view.state, shownChip.from);
              if (range) updateCloze(view, range, { cluster });
            })
          }
          onHint={(hint) =>
            withChip((view) => {
              const range = clozeRangeAt(view.state, shownChip.from);
              if (range) updateCloze(view, range, { hint });
            })
          }
          onRemove={() =>
            withChip((view) => {
              const range = clozeRangeAt(view.state, shownChip.from);
              if (range) removeCloze(view, range);
              view.focus();
            })
          }
          onDone={() =>
            withChip((view) => {
              const range = clozeRangeAt(view.state, shownChip.from);
              if (range)
                view.dispatch(
                  view.state.tr.setSelection(TextSelection.create(view.state.doc, range.to)),
                );
              view.focus();
            })
          }
        />
      )}
      <ImageZoomDialog src={preview} open={preview !== null} onClose={() => setPreview(null)} />
    </div>
  );
}
