import { useConnection } from "@/lib/session";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
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
import { hasEmptyClozeDeletion, parseClozes } from "@armin/core/flashcard-rules";
import { ClozeField, Field, TagsInput } from "@/components/flashcard-form-fields";
import type { FlashcardContent, FlashcardType } from "@armin/core/flashcard-types";

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

/** The editable text of every card type; only the current type's fields are used. */
type FormFields = {
  front: string;
  back: string;
  clozeText: string;
  clozeExtra: string;
  prompt: string;
  answer: string;
  acceptedAnswers: string[];
};

const EMPTY_FIELDS: FormFields = {
  front: "",
  back: "",
  clozeText: "",
  clozeExtra: "",
  prompt: "",
  answer: "",
  acceptedAnswers: [],
};

/** The form fields for stored card content (empty for a new card). */
function fieldsFromContent(type: FlashcardType, content: FlashcardContent | null): FormFields {
  if (!content) return EMPTY_FIELDS;
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const { front, back } = content as { front: string; back: string };
      return { ...EMPTY_FIELDS, front, back };
    }
    case "cloze": {
      const c = content as { text: string; extra?: string };
      return { ...EMPTY_FIELDS, clozeText: c.text, clozeExtra: c.extra ?? "" };
    }
    case "type_answer": {
      const c = content as {
        prompt: string;
        answer: string;
        acceptedAnswers?: string[];
      };
      return {
        ...EMPTY_FIELDS,
        prompt: c.prompt,
        answer: c.answer,
        acceptedAnswers: c.acceptedAnswers ?? [],
      };
    }
    default:
      return EMPTY_FIELDS;
  }
}

/** Comparable form state, used to detect unsaved changes. */
function formSnapshot(type: FlashcardType, fields: FormFields, tags: string[]) {
  return JSON.stringify({ type, ...fields, tags });
}

/** Card content to save, or null while required fields are missing. */
function contentFromFields(
  type: FlashcardType,
  fields: FormFields,
  imageOcclusion: FlashcardContent | null,
): FlashcardContent | null {
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const front = fields.front.trim();
      const back = fields.back.trim();
      return front && back ? { front, back } : null;
    }
    case "cloze": {
      const text = fields.clozeText;
      if (parseClozes(text).length === 0 || hasEmptyClozeDeletion(text)) {
        return null;
      }
      const extra = fields.clozeExtra.trim();
      return extra ? { text, extra } : { text };
    }
    case "type_answer": {
      const prompt = fields.prompt.trim();
      const answer = fields.answer.trim();
      if (!prompt || !answer) return null;
      return { prompt, answer, acceptedAnswers: fields.acceptedAnswers };
    }
    case "image_occlusion":
      return imageOcclusion;
  }
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
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  // Image occlusion can't be edited here; its content is kept so saving tags
  // preserves the masks.
  const [imageOcclusion, setImageOcclusion] = useState<FlashcardContent | null>(null);
  const [tags, setTags] = useState<string[]>(initialTags);

  const [displaySession, setDisplaySession] = useState({
    mode,
    reviewUnitId: reviewUnitId ?? null,
  });
  const [createSession, setCreateSession] = useState(0);
  const [uploads, setUploads] = useState(0);
  const uploadCount = useRef(0);
  const onUploadChange = useCallback((delta: number) => {
    uploadCount.current += delta;
    setUploads(uploadCount.current);
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  // Starts closed even when mounted open: the lazy wrapper first mounts this
  // dialog already open, and that first open must hydrate like any other.
  const [wasOpen, setWasOpen] = useState(false);

  const setField = <K extends keyof FormFields>(key: K, value: FormFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  // Hydrate the form from the card each time the dialog opens, during render
  // so the first open frame already shows the card.
  if (open !== wasOpen) {
    setWasOpen(open);
    setDiscardOpen(false);
    if (open) {
      const initialFields = fieldsFromContent(initialType, initialContent);
      setType(initialType);
      setFields(initialFields);
      setImageOcclusion(initialType === "image_occlusion" ? initialContent : null);
      setTags(initialTags);
      setInitialSnapshot(formSnapshot(initialType, initialFields, initialTags));
      setDisplaySession({ mode, reviewUnitId: reviewUnitId ?? null });
      if (mode === "create") setCreateSession(0);
    }
  }

  useEffect(() => {
    if (!discardOpen) return;
    const frame = requestAnimationFrame(() => keepEditingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [discardOpen]);

  const displayMode = open ? mode : displaySession.mode;
  const displayCardId = open ? (reviewUnitId ?? null) : displaySession.reviewUnitId;

  const content = contentFromFields(type, fields, imageOcclusion);
  // Disconnected: keep the draft but don't start a save whose outcome
  // can't be confirmed.
  const { online } = useConnection();
  const canSubmit = content !== null && !submitting && uploads === 0 && online;

  const dirty = initialSnapshot !== null && formSnapshot(type, fields, tags) !== initialSnapshot;

  const requestClose = () => {
    // Closing mid-save would hide whether the save landed.
    if (submitting) return;
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
    if (!content || submitting || !online || uploadCount.current > 0) return;
    setSubmitting(true);
    try {
      await onSubmit({ type, content, tags });
      if (mode === "create") {
        // Ready for the next card: same type and tags, empty fields.
        setFields(EMPTY_FIELDS);
        setImageOcclusion(null);
        setCreateSession((session) => session + 1);
        setInitialSnapshot(formSnapshot(type, EMPTY_FIELDS, tags));
      }
    } catch {
      // The caller already reported the failure; the form stays open with the
      // user's edits so they can try again.
    } finally {
      setSubmitting(false);
    }
  };

  const submitFromShortcut = useEffectEvent(() => void handleSubmit());

  useEffect(() => {
    if (!open || discardOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();
        submitFromShortcut();
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
        discardOpen ? "Discard changes?" : displayMode === "edit" ? "Edit flashcard" : "Add card"
      }
      description={discardOpen ? "Your edits to this card haven't been saved." : undefined}
      className="max-w-[35rem]"
      footer={
        discardOpen ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={keepEditingRef} variant="ghost" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={discardChanges}>
              Discard changes
            </Button>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" disabled={submitting} onClick={requestClose}>
              Cancel
              <Kbd>Esc</Kbd>
            </Button>
            <Button
              disabled={!canSubmit && !submitting}
              busy={submitting}
              onClick={() => void handleSubmit()}
            >
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
          {displayMode === "create" && decks && decks.length > 0 && onDeckChange && (
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
                  onUploadChange={onUploadChange}
                  key={`front-${editorKey}`}
                  autoFocus
                  aria-label="Flashcard front"
                  value={fields.front}
                  onChange={(value) => setField("front", value)}
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
                  onUploadChange={onUploadChange}
                  key={`back-${editorKey}`}
                  aria-label="Flashcard back"
                  value={fields.back}
                  onChange={(value) => setField("back", value)}
                  placeholder={'`"object"` — a historical bug kept for compatibility.'}
                />
              </Field>
            </>
          )}

          {type === "cloze" && (
            <ClozeField
              key={`cloze-${editorKey}`}
              value={fields.clozeText}
              onChange={(value) => setField("clozeText", value)}
            />
          )}
          {type === "cloze" && (
            <Field label="Extra" hint="Optional. Shown only after the answer is revealed.">
              <MarkdownEditor
                onUploadChange={onUploadChange}
                key={`cloze-extra-${editorKey}`}
                aria-label="Cloze extra"
                value={fields.clozeExtra}
                onChange={(value) => setField("clozeExtra", value)}
                placeholder="A source, mnemonic, or fuller explanation."
              />
            </Field>
          )}

          {type === "type_answer" && (
            <>
              <Field label="Prompt" hint="The question to answer.">
                <MarkdownEditor
                  onUploadChange={onUploadChange}
                  key={`prompt-${editorKey}`}
                  autoFocus
                  aria-label="Prompt"
                  value={fields.prompt}
                  onChange={(value) => setField("prompt", value)}
                  placeholder="Capital of France?"
                />
              </Field>
              <Field label="Answer" hint="The expected typed answer.">
                <Input
                  key={`answer-${editorKey}`}
                  value={fields.answer}
                  onChange={(e) => setField("answer", e.target.value)}
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
                  value={fields.acceptedAnswers}
                  onChange={(value) => setField("acceptedAnswers", value)}
                  placeholder="e.g. paris, ville de paris"
                />
              </Field>
            </>
          )}

          {type === "image_occlusion" && (
            <Field label="Image occlusion">
              <div className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-muted">
                Image occlusion authoring is not available in this editor yet. Existing masks are
                preserved when saving tags or other metadata.
              </div>
            </Field>
          )}

          <Field label="Tags" hint="Press Enter or comma to add.">
            <TagsInput key={`tags-${editorKey}`} value={tags} onChange={setTags} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
