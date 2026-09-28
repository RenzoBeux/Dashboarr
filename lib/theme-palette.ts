// Light/dark palette mirroring for the app themes (#450). The UI is authored
// against the dark chrome: `text-zinc-100` is primary text, `bg-zinc-800` a
// raised fill, `text-red-400` a legible accent on near-black. A light-scheme
// theme mirrors those shades instead of rewriting every call site:
//
//   - zinc is fully inverted (50 <-> 950, 100 <-> 900, ... 500 stays), so
//     near-white text becomes near-black and dark fills become light ones.
//   - accent palettes mirror only their pale shades (50-400 <-> 950-600) and
//     their darkest (900/950 <-> 100/50). 500-800 stay put: they back solid
//     buttons and badges with white text, which read the same on either chrome.
//
// Tailwind classes pick this up through CSS variables (tailwind.config.ts
// points the mirrored shades at `--<palette>-<shade>`, ThemeRoot in
// app/_layout.tsx sets them). Hex literals go through `themeColor()`, which
// the <Icon> wrapper and useThemeColor() apply.
//
// Pure data, no imports: tailwind.config.ts loads this file directly, and the
// backend web editor bundles app-themes.ts, which imports it.

export type ColorScheme = "dark" | "light";

type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
type Palette = Record<Shade, string>;

// Tailwind v3 default values, copied so the app bundle doesn't pull in
// tailwindcss/colors (its deprecated-name getters warn on enumeration).
export const PALETTES = {
  zinc: { 50: "#fafafa", 100: "#f4f4f5", 200: "#e4e4e7", 300: "#d4d4d8", 400: "#a1a1aa", 500: "#71717a", 600: "#52525b", 700: "#3f3f46", 800: "#27272a", 900: "#18181b", 950: "#09090b" },
  red: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d", 950: "#450a0a" },
  orange: { 50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74", 400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12", 950: "#431407" },
  amber: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f", 950: "#451a03" },
  yellow: { 50: "#fefce8", 100: "#fef9c3", 200: "#fef08a", 300: "#fde047", 400: "#facc15", 500: "#eab308", 600: "#ca8a04", 700: "#a16207", 800: "#854d0e", 900: "#713f12", 950: "#422006" },
  lime: { 50: "#f7fee7", 100: "#ecfccb", 200: "#d9f99d", 300: "#bef264", 400: "#a3e635", 500: "#84cc16", 600: "#65a30d", 700: "#4d7c0f", 800: "#3f6212", 900: "#365314", 950: "#1a2e05" },
  green: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d", 950: "#052e16" },
  emerald: { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b", 950: "#022c22" },
  teal: { 50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4", 400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e", 800: "#115e59", 900: "#134e4a", 950: "#042f2e" },
  cyan: { 50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490", 800: "#155e75", 900: "#164e63", 950: "#083344" },
  sky: { 50: "#f0f9ff", 100: "#e0f2fe", 200: "#bae6fd", 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1", 800: "#075985", 900: "#0c4a6e", 950: "#082f49" },
  blue: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a", 950: "#172554" },
  indigo: { 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca", 800: "#3730a3", 900: "#312e81", 950: "#1e1b4b" },
  violet: { 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95", 950: "#2e1065" },
  purple: { 50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe", 400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce", 800: "#6b21a8", 900: "#581c87", 950: "#3b0764" },
  fuchsia: { 50: "#fdf4ff", 100: "#fae8ff", 200: "#f5d0fe", 300: "#f0abfc", 400: "#e879f9", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf", 800: "#86198f", 900: "#701a75", 950: "#4a044e" },
  pink: { 50: "#fdf2f8", 100: "#fce7f3", 200: "#fbcfe8", 300: "#f9a8d4", 400: "#f472b6", 500: "#ec4899", 600: "#db2777", 700: "#be185d", 800: "#9d174d", 900: "#831843", 950: "#500724" },
  rose: { 50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c", 800: "#9f1239", 900: "#881337", 950: "#4c0519" },
} as const satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;

const ZINC_MIRROR: Partial<Record<Shade, Shade>> = {
  50: 950, 100: 900, 200: 800, 300: 700, 400: 600,
  600: 400, 700: 300, 800: 200, 900: 100, 950: 50,
};

const ACCENT_MIRROR: Partial<Record<Shade, Shade>> = {
  50: 950, 100: 900, 200: 800, 300: 700, 400: 600,
  900: 100, 950: 50,
};

function mirrorFor(palette: PaletteName): Partial<Record<Shade, Shade>> {
  return palette === "zinc" ? ZINC_MIRROR : ACCENT_MIRROR;
}

/** Shades of `palette` that change between schemes (and so live in CSS vars). */
export function themedShades(palette: PaletteName): Shade[] {
  return (Object.keys(mirrorFor(palette)).map(Number) as Shade[]).sort(
    (a, b) => a - b,
  );
}

function shadeHex(palette: PaletteName, shade: Shade, scheme: ColorScheme): string {
  const target = scheme === "light" ? (mirrorFor(palette)[shade] ?? shade) : shade;
  return PALETTES[palette][target];
}

// "#140b09" -> "20 11 9": the space-separated channel triplet the Tailwind
// tokens expect (rgb(var(--color-x) / <alpha-value>)).
export function hexToRgbChannels(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

// ("#09090b", 0.7) -> "rgba(9, 9, 11, 0.7)", for scrims and gradient stops
// that fade into a theme color.
export function hexToRgba(hex: string, alpha: number): string {
  return `rgba(${hexToRgbChannels(hex).split(" ").join(", ")}, ${alpha})`;
}

/** CSS variable name backing `palette`-`shade`, e.g. "--zinc-500". */
export function paletteVarName(palette: PaletteName, shade: number): string {
  return `--${palette}-${shade}`;
}

/** Every themed palette variable for `scheme`, ready for NativeWind vars(). */
export function paletteVars(scheme: ColorScheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const palette of Object.keys(PALETTES) as PaletteName[]) {
    for (const shade of themedShades(palette)) {
      out[paletteVarName(palette, shade)] = hexToRgbChannels(
        shadeHex(palette, shade, scheme),
      );
    }
  }
  return out;
}

// "#a1a1aa" -> its light-scheme mirror, for every themed shade.
const LIGHT_BY_HEX = new Map<string, string>();
for (const palette of Object.keys(PALETTES) as PaletteName[]) {
  for (const shade of themedShades(palette)) {
    LIGHT_BY_HEX.set(PALETTES[palette][shade], shadeHex(palette, shade, "light"));
  }
}

/**
 * Resolves a color authored for the dark chrome against `scheme`. Tailwind
 * palette hexes at a mirrored shade (see the header) swap to their mirror in
 * the light scheme; anything else (accents at 500-800, white, rgba, service
 * brand colors) passes through unchanged.
 */
export function themeColor<T extends string | undefined>(color: T, scheme: ColorScheme): T {
  if (scheme === "dark" || typeof color !== "string") return color;
  return (LIGHT_BY_HEX.get(color.toLowerCase()) ?? color) as T;
}
