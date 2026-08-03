"use client";

import type { FlashcardContent } from "@/lib/shared/contracts";

export function ClozeText({
  text,
  revealed,
}: {
  text: string;
  revealed: boolean;
}) {
  const parts = text.split(/(\{\{c\d+::[^}]*\}\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/\{\{c\d+::([^}]*)\}\}/);
        if (!m) return <span key={i}>{part}</span>;
        if (!revealed) {
          return (
            <span
              key={i}
              className="rounded bg-[var(--color-surface)] px-1.5 text-[var(--color-text)]"
            >
              {Array.from({ length: Math.max(3, m[1].length) })
                .map(() => "·")
                .join("")}
            </span>
          );
        }
        return (
          <mark
            key={i}
            className="rounded bg-[var(--color-accent)]/25 px-1.5 text-[var(--color-accent)]"
          >
            {m[1]}
          </mark>
        );
      })}
    </>
  );
}

export function CardContent({
  content,
  side,
}: {
  content: FlashcardContent;
  side: "question" | "answer";
}) {
  switch (content.type) {
    case "basic":
      return (
        <p className="text-pretty">
          {side === "question" ? content.front : content.back}
        </p>
      );
    case "cloze":
      return (
        <p className="text-pretty">
          <ClozeText text={content.text} revealed={side === "answer"} />
        </p>
      );
    case "image-occlusion":
      return (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.imageRef}
            alt="Diagram"
            className="mx-auto max-h-96 w-auto max-w-full rounded-lg border border-[var(--color-surface)]"
            draggable={false}
          />
          {side === "question" && (
            <div
              className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-2 p-4"
              aria-hidden="true"
            >
              {content.occlusions.map((o, i) => (
                <div
                  key={o.id}
                  className="flex items-center justify-center rounded font-mono text-sm font-bold text-[var(--color-text)]"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    opacity: 0.92,
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          )}
          {side === "answer" && (
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
              {content.occlusions.map((o, i) => (
                <li
                  key={o.id}
                  className="flex items-baseline gap-2 font-mono text-xs text-[var(--color-muted)]"
                >
                  <span className="text-[var(--color-accent)]">{i + 1}</span>
                  <span>{o.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
  }
}
