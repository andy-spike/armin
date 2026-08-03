"use client";

import { Check, ChevronDown, Lock } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

type NodeState = "secured" | "locked" | "ready";

const NODES = [
  { title: "HTTP status codes", hint: "What each response class means" },
  { title: "Idempotent requests", hint: "Safe to retry, same result" },
  { title: "Designing safe retries", hint: "Layers on both cards below" },
];

function Node({
  index,
  title,
  hint,
  state,
  onLearn,
}: {
  index: number;
  title: string;
  hint: string;
  state: NodeState;
  onLearn: () => void;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-4 rounded-lg border bg-paper px-4 py-3 transition-colors duration-200",
        state === "locked"
          ? "border-ui opacity-80"
          : state === "secured"
            ? "border-accent-tint"
            : "border-ui-2",
      )}
    >
      <span
        className={cn(
          "font-mono text-xs text-muted",
          state === "secured" && "text-accent",
        )}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium text-ink",
            state === "locked" && "text-muted",
          )}
        >
          {title}
        </p>
        <p className="truncate text-xs text-muted">{hint}</p>
      </div>
      {state === "secured" ? (
        <span className="inline-flex items-center gap-1 rounded-sm bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-deep">
          <Check size={12} strokeWidth={2.5} aria-hidden />
          Secured
        </span>
      ) : state === "locked" ? (
        <span className="inline-flex items-center gap-1 rounded-sm bg-bg-2 px-2 py-0.5 text-xs font-medium text-muted">
          <Lock size={12} strokeWidth={2.5} aria-hidden />
          Locked
        </span>
      ) : (
        <button
          type="button"
          onClick={onLearn}
          className="inline-flex h-7 items-center rounded-sm bg-accent px-3 text-xs font-medium text-on-accent outline-none transition-colors hover:bg-accent-deep focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Learn
        </button>
      )}
    </div>
  );
}

export function PrereqDemo() {
  const [states, setStates] = useState<NodeState[]>([
    "ready",
    "locked",
    "locked",
  ]);

  const learn = (i: number) => {
    setStates((prev) => {
      const next = [...prev];
      next[i] = "secured";
      for (let j = i + 1; j < next.length; j++) {
        if (next[j] === "locked" && next[j - 1] === "secured") {
          next[j] = "ready";
        }
      }
      return next;
    });
  };

  const allSecured = states.every((s) => s === "secured");

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col items-stretch gap-1.5">
        {NODES.map((node, i) => (
          <div key={node.title}>
            <Node
              index={i}
              title={node.title}
              hint={node.hint}
              state={states[i]}
              onLearn={() => learn(i)}
            />
            {i < NODES.length - 1 && (
              <div className="flex items-center justify-center py-1">
                <ChevronDown
                  size={14}
                  className={cn(
                    "text-ui-3 transition-colors duration-200",
                    states[i] === "secured" &&
                      states[i + 1] === "ready" &&
                      "text-accent",
                  )}
                  aria-hidden
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {allSecured ? (
        <p className="mt-4 text-center font-mono text-xs text-muted">
          All three secured — the stack is unlocked.
        </p>
      ) : (
        <p className="mt-4 text-center font-mono text-xs text-muted">
          The third card stays locked until the second is learned.
        </p>
      )}
    </div>
  );
}
