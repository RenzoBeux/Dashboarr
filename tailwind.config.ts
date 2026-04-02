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
        background: "#09090b",
        surface: "#18181b",
        "surface-light": "#27272a",
        border: "#3f3f46",
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
