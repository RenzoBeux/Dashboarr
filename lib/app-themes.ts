// Global app theme presets (issue #288). Each theme tints the four chrome
// tokens (background / surface / surface-light / border) together; accents
// (primary + per-dashboard colors) are unaffected. Hex strings so the id
// round-trips through JSON export/import unchanged. Pure data — no
// react-native/nativewind imports, since store tests import this transitively
// via config-schema. Runtime application happens through NativeWind CSS
// variables set in app/_layout.tsx (ThemeRoot).
export const APP_THEMES = [
  {
    id: "default",
    label: "Default",
    description: "Neutral zinc",
    background: "#09090b",
    surface: "#18181b",
    surfaceLight: "#27272a",
    border: "#3f3f46",
    gradient: ["#131316", "#09090b"],
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm red-brown",
    background: "#140b09",
    surface: "#241512",
    surfaceLight: "#362019",
    border: "#4f3128",
    gradient: ["#2e1712", "#140b09"],
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep navy blue",
    background: "#0a0e1a",
    surface: "#131a2b",
    surfaceLight: "#1e2840",
    border: "#354362",
    gradient: ["#16203a", "#0a0e1a"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Dark green",
    background: "#0a120d",
    surface: "#13211a",
    surfaceLight: "#1d3126",
    border: "#31523f",
    gradient: ["#152a1e", "#0a120d"],
  },
  {
    id: "violet",
    label: "Violet",
    description: "Dark purple",
    background: "#0f0a17",
    surface: "#1a1226",
    surfaceLight: "#281c3a",
    border: "#443059",
    gradient: ["#241536", "#0f0a17"],
  },
] as const;

export type AppTheme = (typeof APP_THEMES)[number];
export type AppThemeId = AppTheme["id"];

export const DEFAULT_APP_THEME: AppThemeId = "default";

const THEMES_BY_ID = new Map<string, AppTheme>(
  APP_THEMES.map((t) => [t.id, t]),
);

export function isValidAppTheme(value: unknown): value is AppThemeId {
  return typeof value === "string" && THEMES_BY_ID.has(value);
}

export function resolveAppTheme(id: string | undefined): AppTheme {
  return (id && THEMES_BY_ID.get(id)) || THEMES_BY_ID.get(DEFAULT_APP_THEME)!;
}

// "#140b09" -> "20 11 9" — the space-separated channel triplet format the
// Tailwind tokens expect (rgb(var(--color-x) / <alpha-value>)).
export function hexToRgbChannels(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
