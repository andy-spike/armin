"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/cn";

export function Editor({
  value,
  onChange,
  placeholder,
  autofocus = false,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autofocus?: boolean;
  className?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "prose-none min-h-[4.5rem] w-full rounded-lg border border-[var(--color-surface-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/60 focus:border-[var(--color-accent)]",
      },
    },
    autofocus: autofocus ? "end" : false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  return (
    <div className={cn("relative", className)}>
      <EditorContent editor={editor} />
    </div>
  );
}
