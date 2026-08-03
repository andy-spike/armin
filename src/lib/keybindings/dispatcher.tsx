import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import {
  COMMANDS,
  getEffectiveKeymap,
  isModifierKey,
  type Scope,
} from "@/lib/keybindings/registry";
import type { Keybinding } from "@/lib/shared/contracts";

type Handler = () => void;

interface DispatcherContextValue {
  scopes: Scope[];
  activeScope: Scope;
  register: (scope: Scope, commandId: string, handler: Handler) => () => void;
  keymap: Map<string, string[]>;
  chordState: string[];
}

const DispatcherContext = createContext<DispatcherContextValue | null>(null);
const COMMAND_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const t = target;
  return (
    t.isContentEditable ||
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT"
  );
}

function normalizeKey(e: KeyboardEvent): string {
  if (e.key === " ") return " ";
  if (e.key === "Escape") return "escape";
  if (e.key === "?") return "?";
  return e.key.toLowerCase();
}

function hasModifier(e: KeyboardEvent): boolean {
  const mod = navigator.platform.toLowerCase().includes("mac")
    ? e.metaKey
    : e.ctrlKey;
  return mod || e.altKey || e.metaKey;
}

function matchCommand(
  buffer: string[],
  keys: string[],
): "full" | "prefix" | "none" {
  if (keys.length <= buffer.length) {
    return keys.length === buffer.length &&
      keys.every((k, i) => k === buffer[i])
      ? "full"
      : "none";
  }
  return keys.every((k, i) => k === buffer[i]) ? "prefix" : "none";
}

export function KeybindingsProvider({
  children,
  overrides = [],
}: {
  children: ReactNode;
  overrides?: Keybinding[];
}) {
  const [chordState, setChordState] = useState<string[]>([]);
  const [registrations, setRegistrations] = useState<
    Array<{ scope: Scope; commandId: string }>
  >([]);
  const handlersRef = useRef(new Map<string, Handler>());
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keymap = useMemo(() => getEffectiveKeymap(overrides), [overrides]);

  const register = useCallback(
    (scope: Scope, commandId: string, handler: Handler) => {
      handlersRef.current.set(commandId, handler);
      setRegistrations((prev) => {
        const idx = prev.findIndex((r) => r.commandId === commandId);
        const next = idx === -1 ? prev : prev.filter((_, i) => i !== idx);
        return [...next, { scope, commandId }];
      });
      return () => {
        handlersRef.current.delete(commandId);
        setRegistrations((prev) =>
          prev.filter((r) => r.commandId !== commandId),
        );
      };
    },
    [],
  );

  const scopes = useMemo(() => {
    const active = new Set<Scope>();
    for (const r of registrations) {
      const command = COMMAND_BY_ID.get(r.commandId);
      if (command) active.add(command.scope);
    }
    const ordered: Scope[] = [];
    for (const r of registrations) {
      const command = COMMAND_BY_ID.get(r.commandId);
      if (command && command.scope !== "global" && !ordered.includes(command.scope)) {
        ordered.push(command.scope);
      }
    }
    return ["global" as Scope, ...ordered];
  }, [registrations]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = normalizeKey(e);
      if (key === "escape") {
        setChordState([]);
        return;
      }
      if (isModifierKey(key)) return;
      if (isEditableTarget(e.target) && !hasModifier(e) && key !== " " && key !== "?") {
        return;
      }
      const buffer = [...chordState, key];

      for (let i = scopes.length - 1; i >= 0; i--) {
        const scope = scopes[i];
        for (const [commandId, keys] of keymap) {
          const command = COMMAND_BY_ID.get(commandId);
          if (!command || command.scope !== scope) continue;
          const status = matchCommand(buffer, keys);
          if (status === "full") {
            e.preventDefault();
            setChordState([]);
            handlersRef.current.get(commandId)?.();
            return;
          }
          if (status === "prefix") {
            e.preventDefault();
            setChordState(buffer);
            if (chordTimer.current) clearTimeout(chordTimer.current);
            chordTimer.current = setTimeout(() => setChordState([]), 1000);
            return;
          }
        }
      }
      setChordState([]);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (chordTimer.current) clearTimeout(chordTimer.current);
    };
  }, [keymap, scopes, chordState]);

  const activeScope = scopes[scopes.length - 1] ?? "global";

  return (
    <DispatcherContext.Provider
      value={{ scopes, activeScope, register, keymap, chordState }}
    >
      {children}
    </DispatcherContext.Provider>
  );
}

export function useKeybindings(): DispatcherContextValue {
  const ctx = useContext(DispatcherContext);
  if (!ctx) {
    throw new Error("useKeybindings must be used within KeybindingsProvider");
  }
  return ctx;
}

export function useKeybinding(
  scope: Scope,
  commandId: string,
  handler: Handler,
) {
  const { register } = useKeybindings();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => register(scope, commandId, () => handlerRef.current()), [
    register,
    scope,
    commandId,
  ]);
}

export function useSettingsKeymap() {
  const { data: settings } = useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.getSettings(),
  });
  const effective = useMemo(
    () =>
      settings
        ? getEffectiveKeymap(settings.keybindings)
        : getEffectiveKeymap([]),
    [settings],
  );
  return { settings, effective };
}
