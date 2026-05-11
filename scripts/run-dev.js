#!/usr/bin/env node
// Sets APP_VARIANT=development before invoking expo, so app.config.ts
// produces the side-by-side dev build (different name/bundle id/scheme).
// Used by `pnpm android:dev`, `pnpm ios:dev`, `pnpm start:dev`.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

process.env.APP_VARIANT = "development";

// Resolve the local expo CLI binary from node_modules/.bin. Going through this
// path (vs. `pnpm exec`) avoids PATH-resolution quirks on Windows where the
// child shell can exit silently without invoking expo at all.
const isWin = process.platform === "win32";
const binName = isWin ? "expo.cmd" : "expo";
const expoBin = path.resolve(__dirname, "..", "node_modules", ".bin", binName);

if (!fs.existsSync(expoBin)) {
  console.error(`[run-dev] expo binary not found at ${expoBin}`);
  console.error(`[run-dev] Run \`pnpm install\` first.`);
  process.exit(1);
}

const result = spawnSync(expoBin, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
  shell: isWin,
});

if (result.error) {
  console.error(`[run-dev] failed to launch expo:`, result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
