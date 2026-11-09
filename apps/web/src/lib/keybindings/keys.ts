const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");

const NAMED_KEYS = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export type ChordStep = {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
};

export function stepHasStrongModifier(step: ChordStep): boolean {
  return step.mod || step.alt;
}

function normalizeKey(raw: string): string | null {
  if (raw === " ") return "Space";
  if (NAMED_KEYS.has(raw)) return raw;
  if (["Control", "Meta", "Shift", "Alt", "AltGraph", "Dead"].includes(raw)) {
    return null;
  }
  if (raw.length === 1) {
    return /[a-z]/i.test(raw) ? raw.toLowerCase() : raw;
  }
  return raw;
}

export function stepFromEvent(event: KeyboardEvent): ChordStep | null {
  const key = normalizeKey(event.key);
  if (key === null) return null;
  const shiftIsModifier = /^[a-z]$/.test(key) || NAMED_KEYS.has(key);
  return {
    mod: isMac ? event.metaKey : event.ctrlKey,
    alt: event.altKey,
    shift: shiftIsModifier && event.shiftKey,
    key,
  };
}

export function serializeStep(step: ChordStep): string {
  const parts: string[] = [];
  if (step.mod) parts.push("Mod");
  if (step.alt) parts.push("Alt");
  if (step.shift) parts.push("Shift");
  parts.push(step.key);
  return parts.join("+");
}

export function parseStep(token: string): ChordStep {
  const parts = token.split("+");
  const key = parts.pop() ?? "";
  return {
    mod: parts.includes("Mod"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    key,
  };
}

export function parseBinding(binding: string): ChordStep[] {
  return binding
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .map(parseStep);
}

export function stepsEqual(a: ChordStep, b: ChordStep): boolean {
  return a.mod === b.mod && a.alt === b.alt && a.shift === b.shift && a.key === b.key;
}

export function serializeSteps(steps: ChordStep[]): string {
  return steps.map(serializeStep).join(" ");
}

export function isStepsPrefix(prefix: ChordStep[], steps: ChordStep[]): boolean {
  if (prefix.length > steps.length) return false;
  return prefix.every((step, i) => stepsEqual(step, steps[i]));
}

const MOD_LABEL = isMac ? "⌘" : "Ctrl";
const KEY_LABELS: Record<string, string> = {
  Space: "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Enter: "↵",
  Escape: "Esc",
};

function renderKeyLabel(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key.length === 1 ? key.toUpperCase() : key;
}

export function stepLabels(step: ChordStep): string[] {
  const tokens: string[] = [];
  if (step.mod) tokens.push(MOD_LABEL);
  if (step.alt) tokens.push(isMac ? "⌥" : "Alt");
  if (step.shift) tokens.push(isMac ? "⇧" : "Shift");
  tokens.push(renderKeyLabel(step.key));
  return tokens;
}

export function formatBinding(binding: string): string {
  const steps = parseBinding(binding);
  if (steps.length === 0) return "—";
  const rendered = steps.map((s) => stepLabels(s).join(isMac ? "" : "+"));
  return rendered.join(" then ");
}
