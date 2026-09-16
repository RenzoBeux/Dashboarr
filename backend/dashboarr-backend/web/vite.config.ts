import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: here,
  // Relative asset URLs so the bundle works both at the root and behind a
  // reverse-proxy path prefix such as https://host/dashboarr/ (see api.ts).
  base: "./",
  plugins: [react()],
  build: {
    // Lands next to the server build; routes/ui-static.ts serves it from there.
    outDir: fileURLToPath(new URL("../dist/web", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  server: {
    port: 5173,
    // Cookies are host-scoped, not port-scoped, so the session cookie set
    // through the proxy is sent back on later /ui/api calls.
    proxy: { "/ui/api": "http://localhost:4000" },
  },
});
