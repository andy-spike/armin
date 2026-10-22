import { useConnection } from "@/lib/session";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { clozeClusters, parseClozes } from "@armin/core/flashcard-rules";
import type {
  FlashcardContent,
  FlashcardType,
} from "@armin/core/flashcard-types";

export type CardFormValues = {
  type: FlashcardType;
  content: FlashcardContent;
  tags: string[];
};

type CardFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  mode: "create" | "edit";
  reviewUnitId?: string | null;
  initialType?: FlashcardType;
  initialContent?: FlashcardContent | null;
  initialTags?: string[];
  onSubmit: (values: CardFormValues) => void | Promise<void>;
  /**
   * When the caller can't infer the deck, pass the deck list + selected deck to
   * render a deck picker in create mode. Omit when the deck is already known
   * (deck page, deck graph, connected add).
   */
  decks?: { id: string; name: string }[];
  deckId?: string | null;
  onDeckChange?: (deckId: string) => void;
};

const TYPE_OPTIONS: { value: FlashcardType; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "basic_reversed", label: "Reversed" },
  { value: "cloze", label: "Cloze" },
  { value: "type_answer", label: "Type answer" },
];

const EMPTY_FORM = {
  front: "",
  back: "",
  clozeText: "",
  prompt: "",
  answer: "",
  acceptedAnswers: [] as string[],
};

/** Stable snapshot of the editable fields, used to detect unsaved changes. */
function formSnapshot(
  type: FlashcardType,
  content: FlashcardContent | null,
  tags: string[],
) {
  const values = content
    ? type === "basic" || type === "basic_reversed"
      ? {
          ...EMPTY_FORM,
          front: (content as { front: string }).front,
          back: (content as { back: string }).back,
        }
      : type === "cloze"
        ? { ...EMPTY_FORM, clozeText: (content as { text: string }).text }
        : type === "type_answer"
          ? {
              ...EMPTY_FORM,
              prompt: (content as { prompt: string }).prompt,
              answer: (content as { answer: string }).answer,
              acceptedAnswers:
                (content as { acceptedAnswers?: string[] }).acceptedAnswers ??
                [],
            }
          : EMPTY_FORM
    : EMPTY_FORM;
  return JSON.stringify({ type, ...values, tags });
}

export function FlashcardFormDialog({
  open,
  onClose,
  onExitComplete,
  mode,
  reviewUnitId = null,
  initialType = "basic",
  initialContent = null,
  initialTags = [],
  onSubmit,
  decks,
  deckId,
  onDeckChange,
}: CardFormDialogProps) {
  const [type, setType] = useState<FlashcardType>(initialType);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [clozeText, setClozeText] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>([]);
  const [imageOcclusion, setImageOcclusion] = useState<FlashcardContent | null>(
    null,
  );
  const [tags, setTags] = useState<string[]>(initialTags);

  const [displaySession, setDisplaySession] = useState({
    mode,
    reviewUnitId: reviewUnitId ?? null,
  });
  const [createSession, setCreateSession] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const initialSnapshotRef = useRef<string | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  // Starts closed even when mounted open: the lazy wrapper first mounts this
  // dialog already open, and that first open must hydrate like any other.
  const wasOpenRef = useRef(false);
  const handleSubmitRef = useRef<(() => Promise<void>) | null>(null);

  const resetFields = () => {
    setFront("");
    setBack("");
    setClozeText("");
    setPrompt("");
    setAnswer("");
    setAcceptedAnswers([]);
    setImageOcclusion(null);
  };

  const hydrateFrom = (t: FlashcardType, content: FlashcardContent | null) => {
    resetFields();
    setType(t);
    if (!content) return;
    if (t === "basic" || t === "basic_reversed") {
      const c = content as { front: string; back: string };
      setFront(c.front);
      setBack(c.back);
    } else if (t === "cloze") {
      setClozeText((content as { text: string }).text);
    } else if (t === "type_answer") {
      const c = content as {
        prompt: string;
        answer: string;
        acceptedAnswers: string[];
      };
      setPrompt(c.prompt);
      setAnswer(c.answer);
      setAcceptedAnswers(c.acceptedAnswers ?? []);
    } else if (t === "image_occlusion") {
      setImageOcclusion(content);
    }
  };

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      hydrateFrom(initialType, initialContent);
      setTags(initialTags);
      initialSnapshotRef.current = formSnapshot(
        initialType,
        initialContent,
        initialTags,
      );
      setDiscardOpen(false);
      setDisplaySession({ mode, reviewUnitId: reviewUnitId ?? null });
      if (mode === "create") setCreateSession(0);
    }
    wasOpenRef.current = open;
  }, [open, initialType, initialContent, initialTags, reviewUnitId, mode]);

  useEffect(() => {
    if (!open) setDiscardOpen(false);
  }, [open]);

  useEffect(() => {
    if (!discardOpen) return;
    const frame = requestAnimationFrame(() => keepEditingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [discardOpen]);

  const displayMode = open ? mode : displaySession.mode;
  const displayCardId = open
    ? (reviewUnitId ?? null)
    : displaySession.reviewUnitId;

  const buildContent = (): FlashcardContent | null => {
    switch (type) {
      case "basic":
      case "basic_reversed": {
        if (!front.trim() || !back.trim()) return null;
        return { front: front.trim(), back: back.trim() };
      }
      case "cloze": {
        const deletions = parseClozes(clozeText);
        if (
          deletions.length === 0 ||
          deletions.some((deletion) => deletion.answer.trim().length === 0)
        ) {
          return null;
        }
        return { text: clozeText };
      }
      case "type_answer": {
        if (!prompt.trim() || !answer.trim()) return null;
        return {
          prompt: prompt.trim(),
          answer: answer.trim(),
          acceptedAnswers,
        };
      }
      case "image_occlusion": {
        return imageOcclusion;
      }
    }
  };

  const content = buildContent();
  // Disconnected: keep the draft but don't start a save whose outcome
  // can't be confirmed.
  const { online } = useConnection();
  const canSubmit = content !== null && !submitting && online;

  const currentSnapshot = JSON.stringify({
    type,
    front,
    back,
    clozeText,
    prompt,
    answer,
    acceptedAnswers,
    tags,
  });
  const dirty =
    initialSnapshotRef.current !== null &&
    currentSnapshot !== initialSnapshotRef.current;

  const requestClose = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  const discardChanges = () => {
    setDiscardOpen(false);
    onClose();
  };

  const handleSubmit = async () => {
    const built = buildContent();
    if (!built || submitting || !online) return;
    setSubmitting(true);
    try {
      await onSubmit({ type, content: built, tags });
      if (mode === "create") {
        resetFields();
        setCreateSession((session) => session + 1);
        initialSnapshotRef.current = JSON.stringify({
          type,
          ...EMPTY_FORM,
          tags,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (!open || discardOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();
        void handleSubmitRef.current?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, discardOpen]);

  const editorKey = displayCardId ?? `new-${createSession}`;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (discardOpen) {
          setDiscardOpen(false);
          return;
        }
        requestClose();
      }}
      onExitComplete={onExitComplete}
      title={
        discardOpen
          ? "Discard changes?"
          : displayMode === "edit"
            ? "Edit flashcard"
            : "Add card"
      }
      description={
        discardOpen ? "Your edits to this card haven't been saved." : undefined
      }
      className="max-w-[35rem]"
      footer={
        discardOpen ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={keepEditingRef}
              variant="ghost"
              onClick={() => setDiscardOpen(false)}
            >
              Keep editing
            </Button>
            <Button variant="destructive" onClick={discardChanges}>
              Discard changes
            </Button>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={requestClose}>
              Cancel
              <Kbd>Esc</Kbd>
            </Button>
            <Button disabled={!canSubmit} onClick={() => void handleSubmit()}>
              {displayMode === "edit" ? "Save changes" : "Add card"}
              <Kbd className="border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                Ctrl+Enter
              </Kbd>
            </Button>
          </div>
        )
      }
    >
      {discardOpen ? (
        <p className="text-sm text-muted">
          Discarding removes everything you changed since opening this card.
        </p>
      ) : (
        <div className="space-y-4">
          {displayMode === "create" &&
            decks &&
            decks.length > 0 &&
            onDeckChange && (
              <Field label="Deck" hint="Which deck this card is filed under.">
                <Select
                  value={deckId ?? undefined}
                  items={decks.map((deck) => ({
                    value: deck.id,
                    label: deck.name,
                  }))}
                  onValueChange={(next) => onDeckChange(next as string)}
                >
                  <SelectTrigger className="w-full" aria-label="Deck">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {decks.map((deck) => (
                        <SelectItem key={deck.id} value={deck.id}>
                          {deck.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          <Field label="Type">
            <div className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  aria-pressed={type === option.value}
                  className={cn(
                    "min-w-0 rounded-md border px-2.5 py-1.5 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    type === option.value
                      ? "border-accent bg-accent text-on-accent"
                      : "border-border-strong bg-surface text-muted hover:text-ink",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          {(type === "basic" || type === "basic_reversed") && (
            <>
              <Field label="Front" hint="The prompt or question.">
                <MarkdownEditor
                  key={`front-${editorKey}`}
                  autoFocus
                  aria-label="Flashcard front"
                  value={front}
                  onChange={setFront}
                  placeholder="What does `typeof null` return?"
                />
              </Field>
              <Field
                label="Back"
                hint={
                  type === "basic_reversed"
                    ? "Creates 2 reviews — one each direction."
                    : "The answer to recall."
                }
              >
                <MarkdownEditor
                  key={`back-${editorKey}`}
                  aria-label="Flashcard back"
                  value={back}
                  onChange={setBack}
                  placeholder={
                    '`"object"` — a historical bug kept for compatibility.'
                  }
                />
              </Field>
            </>
          )}

          {type === "cloze" && (
            <ClozeField
              key={`cloze-${editorKey}`}
              value={clozeText}
              onChange={setClozeText}
            />
          )}

          {type === "type_answer" && (
            <>
              <Field label="Prompt" hint="The question to answer.">
                <MarkdownEditor
                  key={`prompt-${editorKey}`}
                  autoFocus
                  aria-label="Prompt"
                  value={prompt}
                  onChange={setPrompt}
                  placeholder="Capital of France?"
                />
              </Field>
              <Field label="Answer" hint="The expected typed answer.">
                <Input
                  key={`answer-${editorKey}`}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  aria-label="Answer"
                  placeholder="Paris"
                />
              </Field>
              <Field
                label="Accepted answers"
                hint="Other answers counted as correct. Press Enter to add."
              >
                <TagsInput
                  key={`accepted-${editorKey}`}
                  ariaLabel="Add accepted answer"
                  value={acceptedAnswers}
                  onChange={setAcceptedAnswers}
                  placeholder="e.g. paris, ville de paris"
                />
              </Field>
            </>
          )}

          {type === "image_occlusion" && (
            <Field label="Image occlusion">
              <div className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-muted">
                Image occlusion authoring is not available in this editor yet.
                Existing masks are preserved when saving tags or other metadata.
              </div>
            </Field>
          )}

          <Field label="Tags" hint="Press Enter or comma to add.">
            <TagsInput
              key={`tags-${editorKey}`}
              value={tags}
              onChange={setTags}
            />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function ClozeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const deletions = parseClozes(value);
  const emptyDeletion = deletions.find(
    (deletion) => deletion.answer.trim().length === 0,
  );

  const wrapSelection = () => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const hadSelection = end > start;
    const selected = value.slice(start, end) || "answer";
    // Assign the next cluster number so every deletion carries a stable,
    // explicit identity (reordering can't reattach FSRS history to the wrong
    // card). The user never has to type the number.
    const nextCluster = (clozeClusters(value).at(-1) ?? 0) + 1;
    const prefix = `{{${nextCluster}::`;
    const wrapped = `${prefix}${selected}}}`;
    const next = value.slice(0, start) + wrapped + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      // Reselect the answer: keep the wrapped text highlighted, or select the
      // "answer" placeholder so it can be typed straight over.
      const innerStart = start + prefix.length;
      const innerEnd = innerStart + selected.length;
      el.setSelectionRange(hadSelection ? innerEnd : innerStart, innerEnd);
    });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Shift+C wraps the current selection as a cloze (matches Anki).
    if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "c"
    ) {
      event.preventDefault();
      wrapSelection();
    }
  };

  return (
    <Field
      hint={
        <>
          Select text, then <Kbd>Ctrl/⌘</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>C</Kbd> or Make cloze. Reuse a number to blank together;{" "}
          {"{{1::answer::hint}}"} for hints.
        </>
      }
    >
      <div className="space-y-2">
        <AutoGrowTextarea
          ref={ref}
          autoFocus
          aria-label="Cloze text"
          aria-invalid={emptyDeletion ? true : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="The {{1::mitochondria}} is the powerhouse of the {{2::cell}}."
          minHeight={120}
          maxHeight={300}
        />
        {emptyDeletion && (
          <p role="alert" className="text-xs text-relearning">
            Every cloze deletion needs an answer. Fill in c
            {emptyDeletion.cluster} or remove its blank.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={wrapSelection}
          >
            Make cloze
          </Button>
          {deletions.length > 0 ? (
            <ul className="flex flex-wrap gap-1">
              {deletions.map((d, i) => (
                <li
                  key={`${d.cluster}-${i}`}
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-medium",
                    d.answer.trim()
                      ? "bg-surface-sunken text-muted"
                      : "bg-relearning-bg text-relearning",
                  )}
                >
                  c{d.cluster}: {d.answer || "—"}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-muted">No deletions yet.</span>
          )}
        </div>
      </div>
    </Field>
  );
}

function TagsInput({
  value,
  onChange,
  placeholder,
  ariaLabel = "Add tag",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/,+$/, "").trim();
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2 py-1.5 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-tint">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-ink"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Remove ${tag}`}
            className="rounded-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(draft)}
        aria-label={ariaLabel}
        placeholder={
          value.length === 0 ? (placeholder ?? "e.g. closures, async") : ""
        }
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="h-6 min-w-[8ch] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="block">
      {(label || hint) && (
        <span className="mb-1.5 flex items-baseline gap-2">
          {label && (
            <span className="text-sm font-medium text-ink">{label}</span>
          )}
          {hint && <span className="text-xs text-muted">{hint}</span>}
        </span>
      )}
      {children}
    </div>
  );
}
