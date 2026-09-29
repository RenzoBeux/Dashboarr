import type { Config } from "tailwindcss";
import {
  PALETTES,
  paletteVarName,
  themedShades,
  type PaletteName,
} from "./lib/theme-palette";

// Shades that flip between the dark and light schemes resolve through CSS
// variables set by ThemeRoot (app/_layout.tsx) from lib/theme-palette.ts, so
// `text-zinc-100` / `text-red-400` darken under the Light theme (#450) with no
// call-site changes. Shades that don't flip keep Tailwind's static value.
// extend deep-merges, so each palette only lists its themed shades.
const themedPalettes = Object.fromEntries(
  (Object.keys(PALETTES) as PaletteName[]).map((palette) => [
    palette,
    Object.fromEntries(
      themedShades(palette).map((shade) => [
        shade,
        `rgb(var(${paletteVarName(palette, shade)}) / <alpha-value>)`,
      ]),
    ),
  ]),
);

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ...themedPalettes,
        // Chrome tokens resolve through CSS variables so the app theme
        // (lib/app-themes.ts, applied by ThemeRoot in app/_layout.tsx) can
        // retint them at runtime. Channel-triplet + <alpha-value> form keeps
        // opacity modifiers (bg-surface-light/70 etc.) working. Defaults live
        // in global.css :root.
        background: "rgb(var(--color-background) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-light": "rgb(var(--color-surface-light) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        primary: "#3b82f6",
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        download: "#3b82f6",
        upload: "#22c55e",
      },
    },
  },
  plugins: [],
} satisfies Config;
