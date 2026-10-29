import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { CircleHelp, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { parseClozes } from "@armin/core/flashcard-rules";
import { MarkdownEditor } from "@/components/ui/markdown-editor";

// Inputs used by the flashcard form dialog.

export function ClozeField({
  value,
  onChange,
  onUploadChange,
}: {
  value: string;
  onChange: (next: string) => void;
  onUploadChange?: (delta: number) => void;
}) {
  const emptyDeletion = parseClozes(value).find((deletion) => deletion.answer.trim().length === 0);

  return (
    <Field
      label={
        <span className="inline-flex items-center gap-1.5">
          Text
          <Tooltip
            content={
              <div className="space-y-1.5">
                <p>
                  Select the words to hide, then choose Cloze or press{" "}
                  <span className="inline-flex gap-0.5 align-middle">
                    <Kbd>Ctrl/⌘</Kbd>
                    <Kbd>Shift</Kbd>
                    <Kbd>C</Kbd>
                  </span>
                  .
                </p>
                <p>
                  Each number is a separate card. Give two clozes the same number to hide them
                  together.
                </p>
                <p>Put the cursor in a cloze to change its number or add a hint.</p>
              </div>
            }
          >
            <button
              type="button"
              aria-label="How to make clozes"
              className="flex size-5 items-center justify-center rounded-full text-muted outline-hidden transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CircleHelp className="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </Tooltip>
        </span>
      }
    >
      <div className="space-y-2">
        <MarkdownEditor
          cloze
          autoFocus
          aria-label="Cloze text"
          value={value}
          onChange={onChange}
          onUploadChange={onUploadChange}
          placeholder="Write a sentence, then select the words to hide."
        />
        {emptyDeletion && (
          <p role="alert" className="text-xs text-relearning">
            Every cloze needs an answer. Fill in cloze {emptyDeletion.cluster} or remove it.
          </p>
        )}
      </div>
    </Field>
  );
}

export function TagsInput({
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
        placeholder={value.length === 0 ? (placeholder ?? "e.g. closures, async") : ""}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="h-6 min-w-[8ch] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="block">
      {(label || hint) && (
        <span className="mb-1.5 flex items-baseline gap-2">
          {label && <span className="text-sm font-medium text-ink">{label}</span>}
          {hint && <span className="text-xs text-muted">{hint}</span>}
        </span>
      )}
      {children}
    </div>
  );
}
