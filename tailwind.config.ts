import type { Config } from "tailwindcss";

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
