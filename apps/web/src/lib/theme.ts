import {
  DEFAULT_APPEARANCE,
  appearanceProblem,
  resolveSlot,
  type Appearance,
  type ResolvedTheme,
  type ThemeMode,
  type ThemeScheme,
} from "@armin/core/themes";

export const APPEARANCE_STORAGE_KEY = "armin-appearance";
const LEGACY_STORAGE_KEY = "armin-theme-preference";

type CachedAppearance = { appearance: Appearance; light: ResolvedTheme; dark: ResolvedTheme };

export const MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function legacyAppearance(value: string | null): Appearance {
  if (value === "flexoki-dark") return { ...DEFAULT_APPEARANCE, mode: "dark" };
  if (value === "flexoki-light" || value === "light") {
    return { ...DEFAULT_APPEARANCE, mode: "light" };
  }
  return DEFAULT_APPEARANCE;
}

export function readCachedAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as Partial<CachedAppearance>;
      const appearance = cached.appearance;
      if (appearance && Array.isArray(appearance.customThemes) && !appearanceProblem(appearance)) {
        return appearance;
      }
    }
    return legacyAppearance(localStorage.getItem(LEGACY_STORAGE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function cacheAppearance(appearance: Appearance) {
  const cached: CachedAppearance = {
    appearance,
    light: resolveSlot(appearance, "light"),
    dark: resolveSlot(appearance, "dark"),
  };
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(cached));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {}
}

export function sameAppearance(a: Appearance, b: Appearance) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function getSystemScheme(): ThemeScheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function subscribeSystemScheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme.scheme;
  root.dataset.themeId = theme.id;
  root.style.colorScheme = theme.scheme;
  const previous = Array.from({ length: root.style.length }, (_, i) => root.style.item(i));
  for (const name of previous) {
    if (name.startsWith("--armin-")) root.style.removeProperty(name);
  }
  for (const [name, value] of Object.entries(theme.tokens ?? {})) {
    root.style.setProperty(`--armin-${name}`, value);
  }
}
