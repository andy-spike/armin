import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extension-placeholder";
import { ImagePlus } from "lucide-react";
import { MAX_MEDIA_FILE_BYTES, MIME_BY_EXT } from "@armin/core/media";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { cn } from "@/lib/utils";
import {
  mediaDisplayUrl,
  persistMediaRefsInMarkdown,
  resolveMediaRefsInMarkdown,
} from "@/lib/media";
import { ImageZoomDialog } from "@/components/ui/image-zoom-dialog";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ResizableImage } from "@/components/ui/markdown-image";
import { useToast } from "@/components/ui/toast";
import { armin } from "@/lib/armin-client";

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

/**
 * Whether stored Markdown must be edited as source. `@tiptap/markdown` drops
 * GFM tables and rewrites raw HTML blocks, so loading either into the rich
 * editor would lose text on the next save. Anything that fails to tokenize or
 * parses to an empty document is kept as source for the same reason.
 */
function needsSourceMode(editor: Editor, markdown: string) {
  if (!markdown.trim()) return false;
  const hasUnsupportedBlock = (tokens: unknown): boolean =>
    Array.isArray(tokens) &&
    tokens.some((token) => {
      if (!token || typeof token !== "object") return false;
      const t = token as Record<string, unknown>;
      if (t.type === "table" || (t.type === "html" && t.block === true)) {
        return true;
      }
      return hasUnsupportedBlock(t.tokens) || hasUnsupportedBlock(t.items);
    });
  try {
    const resolved = resolveMediaRefsInMarkdown(markdown);
    if (hasUnsupportedBlock(editor.markdown?.instance.lexer(resolved))) {
      return true;
    }
    return !editor.markdown?.parse(resolved)?.content?.length;
  } catch {
    return true;
  }
}

function loadMarkdown(editor: Editor, markdown: string) {
  editor.commands.setContent(resolveMediaRefsInMarkdown(markdown), {
    contentType: "markdown",
    emitUpdate: false,
  });
}

/** Whether the last Markdown block is something other than a paragraph. */
function endsWithNonParagraphBlock(markdown: string) {
  const trimmed = markdown.trimEnd();
  // A closing fence ends a code block even when the code contains blank lines.
  if (/\n\s*(```|~~~)$/.test(trimmed)) return true;
  const lastBlock = trimmed.split(/\n\s*\n/).at(-1) ?? "";
  return /^\s*(```|~~~|[-*+]\s|\d+[.)]\s|>|#{1,6}\s)/.test(lastBlock);
}

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * Creating a TipTap editor takes tens of milliseconds, and React runs the
 * effect that creates it before the browser paints a click's result. A dialog
 * holding two editors therefore appeared only after both existed. The field
 * first renders a static copy of itself, so the dialog paints at once, and
 * swaps in the editor on the next task without moving anything.
 */
export function MarkdownEditor(props: MarkdownEditorProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let timeout = 0;
    // The frame callback runs before the paint, the timeout after it.
    const frame = requestAnimationFrame(() => {
      timeout = window.setTimeout(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, []);
  if (ready) return <RichMarkdownEditor {...props} />;
  return (
    <div
      className={cn("rounded-md border border-border-strong bg-surface", props.className)}
      aria-busy
    >
      <div
        {...(props.autoFocus ? { "data-autofocus": true } : {})}
        className="markdown-editor armin-scrollbar max-h-[220px] min-h-[88px] w-full px-3 py-2 text-sm leading-relaxed text-ink"
      >
        {/* The read-only renderer shares the editor's `markdown-content`
            styles, so formatted text looks the same before and after the swap. */}
        {props.value ? (
          <MarkdownContent content={props.value} className="tiptap">
            {/* The editor keeps an empty paragraph after a final list, quote,
                code block, or heading, so the copy reserves the same line. */}
            {endsWithNonParagraphBlock(props.value) && (
              <p>
                <br />
              </p>
            )}
          </MarkdownContent>
        ) : (
          <div className="tiptap">
            <p className="is-editor-empty" data-placeholder={props.placeholder ?? ""} />
          </div>
        )}
      </div>
      <div className="flex items-center justify-end border-t border-border px-2 py-1">
        <span className="inline-flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-muted">
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          Add image
        </span>
      </div>
    </div>
  );
}

function RichMarkdownEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  "aria-label": ariaLabel,
}: MarkdownEditorProps) {
  const toast = useToast();
  const onUploadError = useCallback(
    (message: string) => toast({ tone: "error", title: "Image not added", description: message }),
    [toast],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const plainTextRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [plainTextMode, setPlainTextMode] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  // The editor is created once, so reach the latest handler/value via refs.
  const onPreviewRef = useRef<((src: string) => void) | null>(null);
  onPreviewRef.current = setPreviewSrc;
  const plainTextModeRef = useRef(plainTextMode);
  plainTextModeRef.current = plainTextMode;
  const valueRef = useRef(value);
  valueRef.current = value;
  const emittedValueRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  const syncScrollOverflow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight) {
      el.dataset.overflowing = "";
    } else {
      delete el.dataset.overflowing;
    }
  }, []);

  const insertPlainMarkdown = useCallback(
    (snippet: string) => {
      const el = plainTextRef.current;
      const current = valueRef.current;
      if (!el) {
        onChange(`${current}${current && !current.endsWith("\n") ? "\n" : ""}${snippet}`);
        return;
      }
      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? start;
      onChange(`${current.slice(0, start)}${snippet}${current.slice(end)}`);
      requestAnimationFrame(() => {
        el.focus();
        const caret = start + snippet.length;
        el.setSelectionRange(caret, caret);
      });
    },
    [onChange],
  );
  const insertPlainMarkdownRef = useRef(insertPlainMarkdown);
  insertPlainMarkdownRef.current = insertPlainMarkdown;

  const insertImageFiles = useCallback(
    async (editor: Editor | null, files: Iterable<File>) => {
      if (!editor && !plainTextModeRef.current) return;
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        if (!UPLOAD_MIME_TYPES.includes(file.type)) {
          onUploadError(UNSUPPORTED_IMAGE_MESSAGE);
          continue;
        }
        if (file.size > MAX_MEDIA_FILE_BYTES) {
          onUploadError(
            `That image is ${megabytes(file.size)} MB. Images must be ${MAX_UPLOAD_MB} MB or smaller.`,
          );
          continue;
        }
        let stored;
        try {
          stored = await armin.media.importImage({ file, fileName: file.name });
        } catch (error) {
          onUploadError(uploadErrorMessage(error));
          continue;
        }
        if (plainTextModeRef.current) {
          // Keep the portable `armin-media:` reference in the source; the
          // read-only renderer resolves it for display.
          insertPlainMarkdownRef.current(`![${file.name}](${stored.ref})`);
          continue;
        }
        if (!editor) continue;
        editor
          .chain()
          .focus()
          .setImage({ src: mediaDisplayUrl(stored.ref), alt: file.name })
          .run();
      }
    },
    [onUploadError],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Every StarterKit block type is enabled: the Markdown parser can emit
      // headings, blockquotes, code blocks, and lists from stored cards, and a
      // node missing from the schema makes the whole field fail to load.
      StarterKit,
      Markdown,
      ResizableImage.configure({
        allowBase64: false,
        onPreview: (src) => onPreviewRef.current?.(src),
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: "",
    contentType: "markdown",
    editorProps: {
      attributes: {
        // `markdown-content` reuses the read-only renderer's list, quote, and
        // code styles so authored blocks look the same before and after save.
        class: "tiptap markdown-content outline-none",
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
      // Ctrl/Cmd+Enter submits the card form (handled at the dialog level), so
      // swallow it here to stop ProseMirror from inserting a stray newline. The
      // DOM event still bubbles up to the dialog's submit listener.
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files?.length && Array.from(files).some((f) => f.type.startsWith("image/"))) {
          void insertImageFiles(editorRef.current, files);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = (event as DragEvent).dataTransfer?.files;
        if (files?.length && Array.from(files).some((f) => f.type.startsWith("image/"))) {
          event.preventDefault();
          void insertImageFiles(editorRef.current, files);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = persistMediaRefsInMarkdown(current.getMarkdown());
      emittedValueRef.current = next;
      onChange(next);
      requestAnimationFrame(syncScrollOverflow);
    },
    onCreate: ({ editor: current }) => {
      // Detect constructs the schema cannot represent before loading them:
      // the editor's own Markdown parsing silently drops GFM tables, and a
      // later save would then overwrite the stored source without them.
      if (needsSourceMode(current, value)) {
        setPlainTextMode(true);
      } else {
        loadMarkdown(current, value);
        if (autoFocus) {
          current.commands.focus("end");
        }
      }
      initializedRef.current = true;
      requestAnimationFrame(syncScrollOverflow);
    },
  });

  // editorProps capture their closure at creation time, so reach for the
  // current instance through a ref inside the paste/drop handlers.
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor || !initializedRef.current || plainTextMode) return;
    // Values emitted by this editor are already representable; only an
    // externally supplied value needs the lossless-mode check.
    if (value === emittedValueRef.current) return;
    if (needsSourceMode(editor, value)) {
      setPlainTextMode(true);
      return;
    }
    const current = persistMediaRefsInMarkdown(editor.getMarkdown());
    if (value !== current) loadMarkdown(editor, value);
  }, [editor, value, plainTextMode]);

  useEffect(() => {
    if (plainTextMode && autoFocus) plainTextRef.current?.focus();
  }, [plainTextMode, autoFocus]);

  useLayoutEffect(() => {
    syncScrollOverflow();
  }, [editor, value, syncScrollOverflow]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => syncScrollOverflow());
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncScrollOverflow]);

  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      void insertImageFiles(editor, event.target.files);
    }
    // Reset so the same file can be picked again.
    event.target.value = "";
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border-strong bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-tint",
        className,
      )}
    >
      <div
        ref={containerRef}
        {...(autoFocus ? { "data-autofocus": true } : {})}
        className="markdown-editor armin-scrollbar max-h-[220px] min-h-[88px] w-full px-3 py-2 text-sm leading-relaxed text-ink"
      >
        {plainTextMode ? (
          <AutoGrowTextarea
            ref={plainTextRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            minHeight={88}
            maxHeight={220}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className="armin-scrollbar resize-none rounded-none border-0 bg-transparent px-0 py-0 font-mono text-xs leading-relaxed focus-visible:ring-0"
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
      {plainTextMode && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted">
          Shown as Markdown source because this field contains formatting the rich editor can&apos;t
          display, such as a table. Saving keeps the text exactly as written.
        </p>
      )}
      <div className="flex items-center justify-end border-t border-border px-2 py-1">
        <input
          ref={fileInputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          multiple
          className="hidden"
          onChange={handlePick}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          Add image
        </button>
      </div>
      <ImageZoomDialog
        src={previewSrc}
        open={previewSrc !== null}
        onClose={() => setPreviewSrc(null)}
      />
    </div>
  );
}
