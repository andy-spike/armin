import { useConnection } from "@/lib/session";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { parseClozes } from "@armin/core/flashcard-rules";
import {
  ClozeField,
  Field,
  TagsInput,
} from "@/components/flashcard-form-fields";
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
