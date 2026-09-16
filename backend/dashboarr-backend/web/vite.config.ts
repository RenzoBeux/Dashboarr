import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const here = fileURLToPath(new URL(".", import.meta.url));
// The repo root: the editor bundles the app's pure config modules (schema,
// migrations, catalog, defaults, crypto core) straight from lib/ and store/.
// The Docker image is built from the repo root for the same reason.
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
// Those app modules live outside this package, so their bare imports would
// resolve against a node_modules that does not exist in CI or Docker. Pin the
// only two they use to this package's copies.
const nodeModules = fileURLToPath(new URL("../node_modules/", import.meta.url));

export default defineConfig({
  root: here,
  // Relative asset URLs so the bundle works both at the root and behind a
  // reverse-proxy path prefix such as https://host/dashboarr/ (see api.ts).
  base: "./",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${repoRoot}/` },
      { find: /^@noble\/ciphers(?=\/|$)/, replacement: `${nodeModules}@noble/ciphers` },
      { find: /^@noble\/hashes(?=\/|$)/, replacement: `${nodeModules}@noble/hashes` },
    ],
  },
  build: {
    // Lands next to the server build; routes/ui-static.ts serves it from there.
    outDir: fileURLToPath(new URL("../dist/web", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  test: {
    // Web-side unit tests (editor logic, envelope interop) run here rather
    // than under tsx: the app modules they import live in a package without
    // "type": "module", which tsx would load as CommonJS and lose the named
    // exports; Vitest bundles them through the same aliases as the build.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  server: {
    port: 5173,
    // Cookies are host-scoped, not port-scoped, so the session cookie set
    // through the proxy is sent back on later /ui/api calls.
    proxy: { "/ui/api": "http://localhost:4000" },
  },
});
