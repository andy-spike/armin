import { isStepsPrefix, parseBinding, stepsEqual, type ChordStep } from "./keys";
import type { CommandId } from "./registry";

export type FireableCommand = {
  commandId: CommandId;
  depth: number;
  binding: string;
};

export type Resolution =
  | { type: "fire"; commandId: CommandId }
  | { type: "pending" }
  | { type: "none" };

function bindingSteps(c: FireableCommand): ChordStep[] {
  return parseBinding(c.binding);
}

function exactlyMatches(buffer: ChordStep[], steps: ChordStep[]): boolean {
  return steps.length === buffer.length && steps.every((s, i) => stepsEqual(s, buffer[i]));
}

export function resolve(buffer: ChordStep[], fireable: FireableCommand[]): Resolution {
  if (buffer.length === 0) return { type: "none" };

  let pending = false;
  let best: FireableCommand | null = null;

  for (const c of fireable) {
    const steps = bindingSteps(c);
    if (steps.length === 0) continue;
    if (steps.length > buffer.length && isStepsPrefix(buffer, steps)) {
      pending = true;
      continue;
    }
    if (exactlyMatches(buffer, steps)) {
      if (!best || c.depth > best.depth) best = c;
    }
  }

  if (pending) return { type: "pending" };
  if (best) return { type: "fire", commandId: best.commandId };
  return { type: "none" };
}
