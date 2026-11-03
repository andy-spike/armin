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
  /** The theme on screen now. */
  resolved: ResolvedTheme;
  /**
   * Show a new choice at once and save it to the account when signed in. The
   * promise rejects when the save fails; the choice stays on this device.
   */
  setAppearance: (next: Appearance) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Applies the account's theme everywhere, signed-in app and public pages
 * alike. The account copy in Convex wins; this device keeps a cache so the
 * first paint, and signed-out pages, use the last theme seen here.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setLocal] = useState<Appearance>(() => readCachedAppearance());
  // Read during the first render (not a server snapshot), so hydration never
  // applies the wrong slot over the one theme-init.js already showed.
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
  // While a save is in flight, the subscription still shows the older value.
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
      // Nothing saved yet: keep this device's choice from before syncing.
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
