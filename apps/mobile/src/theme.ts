import { Easing, useColorScheme } from "react-native";

/**
 * Armin's design tokens for React Native. Values mirror the web app's Flexoki
 * palette and semantic aliases (apps/web/src/styles/flexoki-*.css) so both
 * clients share one visual system. See DESIGN.md.
 */
const flexoki = {
  black: "#100f0f",
  paper: "#fffcf0",
  50: "#f2f0e5",
  100: "#e6e4d9",
  150: "#dad8ce",
  200: "#cecdc3",
  300: "#b7b5ac",
  500: "#878580",
  600: "#6f6e69",
  700: "#575653",
  800: "#403e3c",
  850: "#343331",
  900: "#282726",
  950: "#1c1b1a",
  red50: "#ffe1d5",
  red400: "#d14d41",
  red600: "#af3029",
  red700: "#942822",
  red950: "#261312",
  orange50: "#ffe7ce",
  orange400: "#da702c",
  orange600: "#bc5215",
  orange700: "#9d4310",
  orange950: "#27180e",
  yellow50: "#faeec6",
  yellow400: "#d0a215",
  yellow600: "#ad8301",
  yellow950: "#241e08",
  green50: "#edeecf",
  green400: "#879a39",
  green600: "#66800b",
  green950: "#1a1e0c",
  cyan50: "#ddf1e4",
  cyan300: "#5abdac",
  cyan400: "#3aa99f",
  cyan600: "#24837b",
  cyan700: "#1c6c66",
  cyan950: "#101f1d",
  blue50: "#e1eceb",
  blue400: "#4385be",
  blue600: "#205ea6",
  blue950: "#101a24",
};

const light = {
  scheme: "light" as const,
  bg: flexoki.paper,
  bg2: flexoki[50],
  surface: flexoki.paper,
  border: flexoki[100],
  borderStrong: flexoki[150],
  ui3: flexoki[200],
  ink: flexoki.black,
  muted: flexoki[600],
  faint: flexoki[300],
  accent: flexoki.cyan600,
  accentDeep: flexoki.cyan700,
  accentTint: flexoki.cyan50,
  onAccent: flexoki.paper,
  again: flexoki.red600,
  againDeep: flexoki.red700,
  hard: flexoki.orange600,
  hardDeep: flexoki.orange700,
  good: flexoki.green600,
  goodDeep: flexoki.green600,
  easy: flexoki.blue600,
  easyDeep: flexoki.blue600,
  new: flexoki.blue600,
  newBg: flexoki.blue50,
  learning: flexoki.yellow600,
  learningBg: flexoki.yellow50,
  review: flexoki.green600,
  reviewBg: flexoki.green50,
  relearning: flexoki.orange600,
  relearningBg: flexoki.orange50,
  againBg: flexoki.red50,
  /** Notebook grid lines (web: --armin-grid-h / --armin-grid-v). */
  gridH: "rgba(218, 216, 206, 0.42)",
  gridV: "rgba(230, 228, 217, 0.22)",
};

export type Theme = Omit<typeof light, "scheme"> & { scheme: "light" | "dark" };

const dark: Theme = {
  scheme: "dark",
  bg: flexoki.black,
  bg2: flexoki[950],
  surface: flexoki.black,
  border: flexoki[900],
  borderStrong: flexoki[850],
  ui3: flexoki[800],
  ink: flexoki[200],
  muted: flexoki[500],
  faint: flexoki[700],
  accent: flexoki.cyan400,
  accentDeep: flexoki.cyan300,
  accentTint: flexoki.cyan950,
  onAccent: flexoki.black,
  again: flexoki.red400,
  againDeep: flexoki.red600,
  hard: flexoki.orange400,
  hardDeep: flexoki.orange600,
  good: flexoki.green400,
  goodDeep: flexoki.green600,
  easy: flexoki.blue400,
  easyDeep: flexoki.blue600,
  new: flexoki.blue400,
  newBg: flexoki.blue950,
  learning: flexoki.yellow400,
  learningBg: flexoki.yellow950,
  review: flexoki.green400,
  reviewBg: flexoki.green950,
  relearning: flexoki.orange400,
  relearningBg: flexoki.orange950,
  againBg: flexoki.red950,
  gridH: "rgba(64, 62, 60, 0.38)",
  gridV: "rgba(40, 39, 38, 0.2)",
};

export function useTheme() {
  return useColorScheme() === "dark" ? dark : light;
}

/** Font family names registered in App.tsx. Weights are separate families on native. */
export const fonts = {
  serif: "SourceSerif4_600SemiBold",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
};

/**
 * Type roles from DESIGN.md, scaled for phones: body text steps up from the
 * web's 14px to 15sp so it reads at arm's length.
 */
export const type = {
  display: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  headline: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  wordmark: { fontFamily: fonts.serif, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  deckName: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 24, letterSpacing: -0.15 },
  cardFront: { fontFamily: fonts.sansMedium, fontSize: 21, lineHeight: 29 },
  cardBack: { fontFamily: fonts.sans, fontSize: 18, lineHeight: 28 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };

/** The web's --ease-out-quart. */
export const easeOutQuart = Easing.bezier(0.25, 1, 0.5, 1);
