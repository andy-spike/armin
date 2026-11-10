import { useConnection } from "@/lib/session";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
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
import { conceptAvailabilityQuery, settingsQuery } from "@/lib/queries";
import { CONCEPT_BATCH_SIZE } from "@armin/core/concept";
import { hasEmptyClozeDeletion, parseClozes } from "@armin/core/flashcard-rules";
import { ClozeField, Field, TagsInput } from "@/components/flashcard-form-fields";
import { ConceptVariantsPanel } from "@/components/concept-variants-panel";
import { ConceptProNotice, ProMarker, useConceptCardsAllowed } from "@/components/concept-pro";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ImageOcclusionFields } from "@/components/image-occlusion-fields";
import type {
  ConceptContent,
  FlashcardContent,
  FlashcardType,
  ImageOcclusionContent,
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
  decks?: { id: string; name: string }[];
  deckId?: string | null;
  onDeckChange?: (deckId: string) => void;
};

const TYPE_OPTIONS: { value: FlashcardType; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "basic_reversed", label: "Reversed" },
  { value: "cloze", label: "Cloze" },
  { value: "type_answer", label: "Type" },
  { value: "concept", label: "Concept" },
];

type FormFields = {
  front: string;
  back: string;
  clozeText: string;
  clozeExtra: string;
  prompt: string;
  answer: string;
  acceptedAnswers: string[];
  brief: string;
  exercise: string;
  solution: string;
};

const EMPTY_FIELDS: FormFields = {
  front: "",
  back: "",
  clozeText: "",
  clozeExtra: "",
  prompt: "",
  answer: "",
  acceptedAnswers: [],
  brief: "",
  exercise: "",
  solution: "",
};

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
    case "concept": {
      const c = content as ConceptContent;
      return {
        ...EMPTY_FIELDS,
        brief: c.brief,
        exercise: c.example.exercise,
        solution: c.example.solution,
      };
    }
    default:
      return EMPTY_FIELDS;
  }
}

function formSnapshot(type: FlashcardType, fields: FormFields, tags: string[]) {
  return JSON.stringify({ type, ...fields, tags });
}

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
      const text = fields.clozeText.trim();
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
    case "concept": {
      const brief = fields.brief.trim();
      const exercise = fields.exercise.trim();
      const solution = fields.solution.trim();
      if (!brief || !exercise || !solution) return null;
      return { brief, example: { exercise, solution } };
    }
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
  const preferredLayout = useQuery(settingsQuery()).data?.cardEditorLayout ?? "dialog";
  const [fullPage, setFullPage] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const [wasOpen, setWasOpen] = useState(false);

  const setField = <K extends keyof FormFields>(key: K, value: FormFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  if (open !== wasOpen) {
    setWasOpen(open);
    setDiscardOpen(false);
    if (open) {
      setFullPage(preferredLayout === "fullPage");
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

  const conceptAvailability = useQuery({ ...conceptAvailabilityQuery(), enabled: open }).data;
  const conceptUnavailable =
    conceptAvailability && !conceptAvailability.available ? conceptAvailability.reason : null;
  const conceptNeedsPro = useConceptCardsAllowed() === false;

  const displayMode = open ? mode : displaySession.mode;
  const displayCardId = open ? (reviewUnitId ?? null) : displaySession.reviewUnitId;

  const content = contentFromFields(type, fields, imageOcclusion);
  const { online } = useConnection();
  const blockedConcept =
    type === "concept" && (conceptNeedsPro || (displayMode === "create" && !!conceptUnavailable));
  const canSubmit = content !== null && !submitting && uploads === 0 && online && !blockedConcept;

  const dirty = initialSnapshot !== null && formSnapshot(type, fields, tags) !== initialSnapshot;

  const requestClose = () => {
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
    if (!content || submitting || !online || blockedConcept || uploadCount.current > 0) return;
    setSubmitting(true);
    try {
      await onSubmit({ type, content, tags });
      if (mode === "create") {
        setFields(EMPTY_FIELDS);
        setImageOcclusion(null);
        setCreateSession((session) => session + 1);
        setInitialSnapshot(formSnapshot(type, EMPTY_FIELDS, tags));
      }
    } catch {
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
      view={discardOpen ? "discard" : "edit"}
      title={
        discardOpen ? "Discard changes?" : displayMode === "edit" ? "Edit flashcard" : "Add card"
      }
      description={discardOpen ? "Your edits to this card haven't been saved." : undefined}
      className="max-w-[35rem]"
      fullscreen={fullPage && !discardOpen}
      headerActions={
        discardOpen ? undefined : (
          <Tooltip content={fullPage ? "Exit full page" : "Full page"}>
            <button
              type="button"
              onClick={() => setFullPage((current) => !current)}
              aria-label={fullPage ? "Exit full page" : "Full page"}
              aria-pressed={fullPage}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {fullPage ? (
                <Minimize2 className="h-4 w-4" aria-hidden />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden />
              )}
            </button>
          </Tooltip>
        )
      }
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
        <div
          className={cn(
            "grid gap-4 [grid-template-areas:'meta'_'content'_'tags']",
            fullPage &&
              "lg:grid-cols-[minmax(0,1fr)_17rem] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-6 lg:[grid-template-areas:'content_meta'_'content_tags']",
          )}
        >
          <div className="min-w-0 space-y-4 [grid-area:meta]">
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
            <Field
              label="Type"
              hint={
                displayMode === "edit" && initialType === "concept"
                  ? "A concept card keeps its type."
                  : displayMode === "edit" && initialType === "image_occlusion"
                    ? "Image occlusion. Changing the type would discard the masks."
                    : undefined
              }
            >
              <div
                className={cn(
                  "grid w-full grid-cols-3 gap-1.5 sm:grid-cols-5",
                  fullPage && "lg:grid-cols-2",
                )}
              >
                {TYPE_OPTIONS.map((option) => {
                  const unavailable =
                    option.value === "concept" &&
                    displayMode === "create" &&
                    !conceptNeedsPro &&
                    conceptUnavailable;
                  const proOnly =
                    option.value === "concept" && displayMode === "create" && conceptNeedsPro;
                  const button = (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        if (!unavailable) setType(option.value);
                      }}
                      aria-pressed={type === option.value}
                      aria-disabled={unavailable ? true : undefined}
                      disabled={
                        displayMode === "edit" &&
                        ((initialType === "concept") !== (option.value === "concept") ||
                          initialType === "image_occlusion")
                      }
                      className={cn(
                        proOnly && "relative",
                        "min-w-0 rounded-md border px-2.5 py-1.5 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
                        type === option.value
                          ? "border-accent bg-accent text-on-accent"
                          : "border-border-strong bg-surface text-muted hover:text-ink aria-disabled:hover:text-muted",
                      )}
                    >
                      {option.label}
                      {proOnly && (
                        <ProMarker className="absolute -right-1.5 -top-2 bg-accent-deep text-on-accent" />
                      )}
                    </button>
                  );
                  return unavailable ? (
                    <Tooltip key={option.value} content={unavailable}>
                      {button}
                    </Tooltip>
                  ) : (
                    button
                  );
                })}
              </div>
            </Field>
          </div>

          <div className={cn("min-w-0 space-y-4 [grid-area:content]", fullPage && "lg:space-y-6")}>
            {(type === "basic" || type === "basic_reversed") && (
              <>
                <Field label="Front" hint="The prompt or question.">
                  <MarkdownEditor
                    onUploadChange={onUploadChange}
                    key={`front-${editorKey}`}
                    tall={fullPage}
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
                    tall={fullPage}
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
                onUploadChange={onUploadChange}
                tall={fullPage}
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
                    tall={fullPage}
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

            {type === "concept" && conceptNeedsPro && displayMode === "create" && (
              <ConceptProNotice variant="create" />
            )}

            {type === "concept" && conceptNeedsPro && displayMode === "edit" && (
              <>
                <ConceptProNotice variant="lapsed" />
                <Field label="Brief">
                  <MarkdownContent content={fields.brief} className="text-sm" />
                </Field>
                <Field label="Example">
                  <MarkdownContent content={fields.exercise} className="text-sm" />
                </Field>
                <Field label="Solution">
                  <MarkdownContent content={fields.solution} className="text-sm" />
                </Field>
                {displayCardId && (
                  <Field label="Variants">
                    <ConceptVariantsPanel flashcardId={displayCardId} />
                  </Field>
                )}
              </>
            )}

            {type === "concept" && !conceptNeedsPro && (
              <>
                <Field
                  label="Brief"
                  hint="The concept, what to vary, the difficulty, and what to avoid."
                >
                  <MarkdownEditor
                    textOnly
                    key={`brief-${editorKey}`}
                    tall={fullPage}
                    autoFocus
                    aria-label="Brief"
                    value={fields.brief}
                    onChange={(value) => setField("brief", value)}
                    placeholder="Derivatives of polynomials with 2–4 terms. Vary the coefficients and exponents; avoid fractional exponents."
                  />
                </Field>
                <Field label="Example" hint="One exercise, in the format you expect.">
                  <MarkdownEditor
                    textOnly
                    key={`exercise-${editorKey}`}
                    tall={fullPage}
                    aria-label="Example exercise"
                    value={fields.exercise}
                    onChange={(value) => setField("exercise", value)}
                    placeholder="Differentiate $3x^4 - 2x + 5$."
                  />
                </Field>
                <Field label="Solution" hint="The example's worked solution, step by step.">
                  <MarkdownEditor
                    textOnly
                    key={`solution-${editorKey}`}
                    tall={fullPage}
                    aria-label="Example solution"
                    value={fields.solution}
                    onChange={(value) => setField("solution", value)}
                    placeholder="Apply the power rule to each term: $12x^3 - 2$."
                  />
                </Field>
                {displayMode === "edit" && displayCardId ? (
                  <Field label="Variants" hint="Exercises generated from this template.">
                    <ConceptVariantsPanel flashcardId={displayCardId} />
                  </Field>
                ) : (
                  <p className="text-xs text-muted">
                    Text and equations only. After you add the card, Armin generates about{" "}
                    {CONCEPT_BATCH_SIZE} exercises from this template.
                  </p>
                )}
              </>
            )}

            {type === "image_occlusion" && (
              <ImageOcclusionFields content={imageOcclusion as ImageOcclusionContent | null} />
            )}
          </div>

          {!(type === "concept" && conceptNeedsPro) && (
            <div className="min-w-0 self-start [grid-area:tags]">
              <Field label="Tags" hint="Press Enter or comma to add.">
                <TagsInput key={`tags-${editorKey}`} value={tags} onChange={setTags} />
              </Field>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
