/**
 * Color themes. A theme is seven seed colors; every other color the app uses
 * is derived from them here, so web and mobile resolve the same palette.
 * Flexoki is the default and keeps its hand-tuned CSS tokens on the web; every
 * other theme, built-in or custom, is applied as the derived token set.
 */

export const THEME_SEED_KEYS = [
  "background",
  "text",
  "accent",
  "again",
  "hard",
  "good",
  "easy",
] as const;

export type ThemeSeedKey = (typeof THEME_SEED_KEYS)[number];
export type ThemeSeeds = Record<ThemeSeedKey, string>;
export type ThemeScheme = "light" | "dark";
export type ThemeMode = ThemeScheme | "system";

export type ThemeDefinition = {
  id: string;
  name: string;
  seeds: ThemeSeeds;
  /** Built-in high-contrast themes draw borders and secondary text at full strength. */
  highContrast?: boolean;
};

export type CustomTheme = { id: string; name: string; seeds: ThemeSeeds };

/** A user's theme choice, stored per account. */
export type Appearance = {
  mode: ThemeMode;
  lightTheme: string;
  darkTheme: string;
  customThemes: CustomTheme[];
};

/** CSS custom property name (without `--armin-`) to value. */
export type ThemeTokens = Record<string, string>;

export const MAX_CUSTOM_THEMES = 20;
export const MAX_THEME_NAME_LENGTH = 40;
export const FLEXOKI_LIGHT_ID = "flexoki-light";
export const FLEXOKI_DARK_ID = "flexoki-dark";

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system",
  lightTheme: FLEXOKI_LIGHT_ID,
  darkTheme: FLEXOKI_DARK_ID,
  customThemes: [],
};

/** Flexoki's tokens live in CSS; these seeds only start a custom copy. */
const FLEXOKI_THEMES: ThemeDefinition[] = [
  {
    id: FLEXOKI_LIGHT_ID,
    name: "Flexoki Light",
    seeds: {
      background: "#fffcf0",
      text: "#100f0f",
      accent: "#1c6c66",
      again: "#af3029",
      hard: "#bc5215",
      good: "#66800b",
      easy: "#205ea6",
    },
  },
  {
    id: FLEXOKI_DARK_ID,
    name: "Flexoki Dark",
    seeds: {
      background: "#100f0f",
      text: "#cecdc3",
      accent: "#3aa99f",
      again: "#d14d41",
      hard: "#da702c",
      good: "#879a39",
      easy: "#4385be",
    },
  },
];

/**
 * VS Code's built-in color themes, taken from each theme's workbench and
 * terminal colors. "Dark (Visual Studio)" and "Light (Visual Studio)" differ
 * from Dark+ and Light+ only in syntax colors, so they are left out.
 */
const VSCODE_THEMES: ThemeDefinition[] = [
  {
    id: "vscode-light-modern",
    name: "Light Modern",
    seeds: {
      background: "#ffffff",
      text: "#3b3b3b",
      accent: "#005fb8",
      again: "#cd3131",
      hard: "#bf8803",
      good: "#00bc00",
      easy: "#0451a5",
    },
  },
  {
    id: "vscode-dark-modern",
    name: "Dark Modern",
    seeds: {
      background: "#1f1f1f",
      text: "#cccccc",
      accent: "#0078d4",
      again: "#f14c4c",
      hard: "#cca700",
      good: "#23d18b",
      easy: "#3b8eea",
    },
  },
  {
    id: "vscode-light-plus",
    name: "Light+",
    seeds: {
      background: "#ffffff",
      text: "#000000",
      accent: "#007acc",
      again: "#cd3131",
      hard: "#bf8803",
      good: "#008000",
      easy: "#0451a5",
    },
  },
  {
    id: "vscode-dark-plus",
    name: "Dark+",
    seeds: {
      background: "#1e1e1e",
      text: "#d4d4d4",
      accent: "#007acc",
      again: "#f44747",
      hard: "#cca700",
      good: "#89d185",
      easy: "#569cd6",
    },
  },
  {
    id: "vscode-light-high-contrast",
    name: "Light High Contrast",
    highContrast: true,
    seeds: {
      background: "#ffffff",
      text: "#292929",
      accent: "#0f4a85",
      again: "#b5200d",
      hard: "#895503",
      good: "#388a34",
      easy: "#0f4a85",
    },
  },
  {
    id: "vscode-dark-high-contrast",
    name: "Dark High Contrast",
    highContrast: true,
    seeds: {
      background: "#000000",
      text: "#ffffff",
      accent: "#f38518",
      again: "#f48771",
      hard: "#ffd700",
      good: "#89d185",
      easy: "#3794ff",
    },
  },
  {
    id: "vscode-quiet-light",
    name: "Quiet Light",
    seeds: {
      background: "#f5f5f5",
      text: "#333333",
      accent: "#705697",
      again: "#aa3731",
      hard: "#ab6526",
      good: "#448c27",
      easy: "#4b69c6",
    },
  },
  {
    id: "vscode-solarized-light",
    name: "Solarized Light",
    seeds: {
      background: "#fdf6e3",
      text: "#586e75",
      accent: "#2aa198",
      again: "#dc322f",
      hard: "#cb4b16",
      good: "#859900",
      easy: "#268bd2",
    },
  },
  {
    id: "vscode-solarized-dark",
    name: "Solarized Dark",
    seeds: {
      background: "#002b36",
      text: "#93a1a1",
      accent: "#2aa198",
      again: "#dc322f",
      hard: "#cb4b16",
      good: "#859900",
      easy: "#268bd2",
    },
  },
  {
    id: "vscode-monokai",
    name: "Monokai",
    seeds: {
      background: "#272822",
      text: "#f8f8f2",
      accent: "#e6db74",
      again: "#f92672",
      hard: "#fd971f",
      good: "#a6e22e",
      easy: "#66d9ef",
    },
  },
  {
    id: "vscode-monokai-dimmed",
    name: "Monokai Dimmed",
    seeds: {
      background: "#1e1e1e",
      text: "#c5c8c6",
      accent: "#9872a2",
      again: "#c4625b",
      hard: "#ce6700",
      good: "#9aa83a",
      easy: "#6089b4",
    },
  },
  {
    id: "vscode-abyss",
    name: "Abyss",
    seeds: {
      background: "#000c18",
      text: "#6688cc",
      accent: "#ddbb88",
      again: "#f05050",
      hard: "#f28b54",
      good: "#22aa44",
      easy: "#6688cc",
    },
  },
  {
    id: "vscode-kimbie-dark",
    name: "Kimbie Dark",
    seeds: {
      background: "#221a0f",
      text: "#d3af86",
      accent: "#f79a32",
      again: "#dc3958",
      hard: "#f06431",
      good: "#889b4a",
      easy: "#8ab1b0",
    },
  },
  {
    id: "vscode-tomorrow-night-blue",
    name: "Tomorrow Night Blue",
    seeds: {
      background: "#002451",
      text: "#ffffff",
      accent: "#99ffff",
      again: "#ff9da4",
      hard: "#ffc58f",
      good: "#d1f1a9",
      easy: "#bbdaff",
    },
  },
  {
    id: "vscode-red",
    name: "Red",
    seeds: {
      background: "#390000",
      text: "#f8f8f8",
      accent: "#fec758",
      again: "#ff6666",
      hard: "#ff9a4d",
      good: "#b6d36a",
      easy: "#8ab0ff",
    },
  },
];

export const BUILT_IN_THEMES: readonly ThemeDefinition[] = [...FLEXOKI_THEMES, ...VSCODE_THEMES];

export function isFlexokiTheme(id: string) {
  return id === FLEXOKI_LIGHT_ID || id === FLEXOKI_DARK_ID;
}

/* ------------------------------------------------------------------ *
 * Color math (sRGB, matching CSS `color-mix(in srgb, ...)`)
 * ------------------------------------------------------------------ */

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export function isHexColor(value: string) {
  return HEX_COLOR.test(value);
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb) {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `amount` of `to` mixed into `from`. */
export function mixColors(from: string, to: string, amount: number) {
  const a = toRgb(from);
  const b = toRgb(to);
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as Rgb);
}

function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors. */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Dark when white text reads better on the background than black text. */
export function themeScheme(seeds: Pick<ThemeSeeds, "background">): ThemeScheme {
  return contrastRatio(seeds.background, "#ffffff") > contrastRatio(seeds.background, "#000000")
    ? "dark"
    : "light";
}

/**
 * The color moved toward black (light themes) or white (dark themes) only as
 * far as needed to reach `target` contrast against every surface given.
 */
function readableOn(color: string, surfaces: string[], target: number, scheme: ThemeScheme) {
  const toward = scheme === "light" ? "#000000" : "#ffffff";
  for (let step = 0; step <= 20; step++) {
    const candidate = mixColors(color, toward, step / 20);
    if (surfaces.every((surface) => contrastRatio(candidate, surface) >= target)) return candidate;
  }
  return toward;
}

function translucent(hex: string, alpha: number) {
  const [r, g, b] = toRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/**
 * The page's paper grain: a fine static noise tile in `color`, as a CSS image.
 * It matches the hand-tuned Flexoki grain in apps/web's flexoki-theme.css.
 */
function paperGrain(color: string, alpha: number) {
  const [r, g, b] = toRgb(color).map((c) => (c / 255).toFixed(3));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Text and controls must clear WCAG AA. */
const AA = 4.5;

/** Every `--armin-*` token for a theme. */
export function deriveThemeTokens(theme: Pick<ThemeDefinition, "seeds" | "highContrast">) {
  const { seeds } = theme;
  const scheme = themeScheme(seeds);
  const bg = seeds.background;
  const ink = seeds.text;
  const hc = theme.highContrast === true;
  const toward = (amount: number) => mixColors(bg, ink, amount);
  const bg2 = toward(hc ? 0 : 0.04);
  const surfaces = [bg, bg2];

  // Accent and rating colors carry `on-accent` text, which is the background
  // color, so keeping them readable on the background keeps their labels
  // readable too (contrast is symmetric).
  const solid = (seed: string) => readableOn(seed, surfaces, AA, scheme);
  const accent = solid(seeds.accent);
  const again = solid(seeds.again);
  const hard = solid(seeds.hard);
  const good = solid(seeds.good);
  const easy = solid(seeds.easy);
  // Hovers move toward the text color, which raises contrast with the label.
  const hover = (color: string) => mixColors(color, ink, 0.14);
  const deep = (color: string) => mixColors(color, scheme === "light" ? ink : bg, 0.2);

  const state = (seed: string) => {
    const tint = mixColors(bg, seed, scheme === "light" ? 0.12 : 0.16);
    return [readableOn(seed, [tint, bg], AA, scheme), tint] as const;
  };
  const [newColor, newBg] = state(seeds.easy);
  const [learning, learningBg] = state(seeds.accent);
  const [review, reviewBg] = state(seeds.good);
  const [relearning, relearningBg] = state(seeds.hard);

  const border = hc ? ink : toward(0.1);
  const borderStrong = hc ? ink : toward(0.15);

  const tokens: ThemeTokens = {
    bg,
    "bg-2": bg2,
    surface: bg,
    "surface-sunken": toward(hc ? 0.08 : 0.04),
    border,
    "border-strong": borderStrong,
    "ui-3": toward(0.2),
    ink,
    muted: hc ? ink : readableOn(mixColors(ink, bg, 0.25), surfaces, AA, scheme),
    faint: hc ? ink : readableOn(mixColors(ink, bg, 0.35), surfaces, AA, scheme),
    accent,
    "accent-deep": hover(accent),
    "accent-tint": mixColors(bg, accent, 0.14),
    "on-accent": bg,
    again,
    "again-deep": deep(again),
    hard,
    "hard-deep": deep(hard),
    good,
    "good-deep": deep(good),
    easy,
    "easy-deep": deep(easy),
    "rate-again": again,
    "rate-again-hover": hover(again),
    "rate-hard": hard,
    "rate-hard-hover": hover(hard),
    "rate-good": good,
    "rate-good-hover": hover(good),
    "rate-easy": easy,
    "rate-easy-hover": hover(easy),
    new: newColor,
    "new-bg": newBg,
    learning,
    "learning-bg": learningBg,
    review,
    "review-bg": reviewBg,
    relearning,
    "relearning-bg": relearningBg,
    "shadow-overlay":
      scheme === "light"
        ? "0 12px 40px -8px rgb(0 0 0 / 0.18)"
        : "0 12px 40px -8px rgb(0 0 0 / 0.45)",
    // The page's paper: light from above, a faint dot grid, and grain.
    "paper-light": scheme === "light" ? "rgb(255 255 255 / 0.5)" : translucent(ink, 0.035),
    "paper-dot": translucent(
      mixColors(ink, bg, scheme === "light" ? 0.7 : 0.6),
      scheme === "light" ? 0.45 : 0.32,
    ),
    "paper-grain": paperGrain(ink, scheme === "light" ? 0.09 : 0.075),
  };
  return tokens;
}

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

export function findTheme(appearance: Appearance, id: string): ThemeDefinition | undefined {
  return (
    BUILT_IN_THEMES.find((t) => t.id === id) ?? appearance.customThemes.find((t) => t.id === id)
  );
}

/** A theme ready to apply: Flexoki uses its CSS (`tokens: null`). */
export type ResolvedTheme = { id: string; scheme: ThemeScheme; tokens: ThemeTokens | null };

/** The theme in one slot, falling back to Flexoki when it no longer exists. */
export function resolveSlot(appearance: Appearance, slot: ThemeScheme): ResolvedTheme {
  const id = slot === "light" ? appearance.lightTheme : appearance.darkTheme;
  const theme = findTheme(appearance, id);
  if (!theme || isFlexokiTheme(theme.id)) {
    const flexoki = theme?.id ?? (slot === "light" ? FLEXOKI_LIGHT_ID : FLEXOKI_DARK_ID);
    return { id: flexoki, scheme: flexoki === FLEXOKI_DARK_ID ? "dark" : "light", tokens: null };
  }
  return { id: theme.id, scheme: themeScheme(theme.seeds), tokens: deriveThemeTokens(theme) };
}

/* ------------------------------------------------------------------ *
 * Validation (shared by the client and the server)
 * ------------------------------------------------------------------ */

const CUSTOM_ID = /^custom-[a-z0-9-]{1,40}$/;

export function isCustomThemeId(id: string) {
  return CUSTOM_ID.test(id);
}

/** Why an appearance can't be saved, or null when it is valid. */
export function appearanceProblem(appearance: Appearance): string | null {
  if (!["light", "dark", "system"].includes(appearance.mode)) return "Unknown theme mode.";
  if (appearance.customThemes.length > MAX_CUSTOM_THEMES) {
    return `You can keep up to ${MAX_CUSTOM_THEMES} custom themes.`;
  }
  const ids = new Set<string>();
  for (const theme of appearance.customThemes) {
    if (!isCustomThemeId(theme.id) || ids.has(theme.id)) return "Invalid custom theme id.";
    ids.add(theme.id);
    const name = theme.name.trim();
    if (!name || name.length > MAX_THEME_NAME_LENGTH) {
      return `Theme names need 1 to ${MAX_THEME_NAME_LENGTH} characters.`;
    }
    const keys = Object.keys(theme.seeds);
    if (
      keys.length !== THEME_SEED_KEYS.length ||
      !THEME_SEED_KEYS.every((key) => isHexColor(theme.seeds[key]))
    ) {
      return "Theme colors must be six-digit hex colors like #1a2b3c.";
    }
  }
  for (const id of [appearance.lightTheme, appearance.darkTheme]) {
    if (!BUILT_IN_THEMES.some((t) => t.id === id) && !ids.has(id)) return "Unknown theme.";
  }
  return null;
}
