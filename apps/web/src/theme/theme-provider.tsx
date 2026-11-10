import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";
import {
  DEFAULT_APPEARANCE,
  resolveSlot,
  type Appearance,
  type ResolvedTheme,
} from "@armin/core/themes";
import { armin } from "@/lib/armin-client";
import { useLibraryReady } from "@/lib/session";
import {
  applyTheme,
  cacheAppearance,
  getSystemScheme,
  readCachedAppearance,
  sameAppearance,
  subscribeSystemScheme,
} from "@/lib/theme";

type ThemeContextValue = {
  appearance: Appearance;
  resolved: ResolvedTheme;
  setAppearance: (next: Appearance) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setLocal] = useState<Appearance>(() => readCachedAppearance());
  const [systemScheme, setSystemScheme] = useState(getSystemScheme);
  useEffect(() => subscribeSystemScheme(() => setSystemScheme(getSystemScheme())), []);
  const slot = appearance.mode === "system" ? systemScheme : appearance.mode;
  const resolved = useMemo(() => resolveSlot(appearance, slot), [appearance, slot]);

  useEffect(() => applyTheme(resolved), [resolved]);

  const ready = useLibraryReady();
  const remote = useQuery({ ...convexQuery(api.appearance.get, {}), enabled: ready });
  const appearanceRef = useRef(appearance);
  useLayoutEffect(() => {
    appearanceRef.current = appearance;
  });
  const pendingSaves = useRef(0);

  const save = useCallback(async (next: Appearance) => {
    pendingSaves.current++;
    try {
      await armin.appearance.set(next);
    } finally {
      pendingSaves.current--;
    }
  }, []);

  useEffect(() => {
    if (!ready || remote.data === undefined || pendingSaves.current > 0) return;
    if (remote.data === null) {
      const local = appearanceRef.current;
      if (!sameAppearance(local, DEFAULT_APPEARANCE)) save(local).catch(() => {});
      return;
    }
    if (!sameAppearance(remote.data, appearanceRef.current)) setLocal(remote.data);
    cacheAppearance(remote.data);
  }, [ready, remote.data, save]);

  const setAppearance = useCallback(
    async (next: Appearance) => {
      setLocal(next);
      cacheAppearance(next);
      if (ready) await save(next);
    },
    [ready, save],
  );

  const value = useMemo(
    () => ({ appearance, resolved, setAppearance }),
    [appearance, resolved, setAppearance],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
