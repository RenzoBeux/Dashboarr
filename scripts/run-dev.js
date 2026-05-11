#!/usr/bin/env node
// Sets APP_VARIANT=development before invoking expo, so app.config.ts
// produces the side-by-side dev build (different name/bundle id/scheme).
// Used by `pnpm android:dev`, `pnpm ios:dev`, `pnpm start:dev`.
const { spawnSync } = require("child_process");

process.env.APP_VARIANT = "development";

const cmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(cmd, ["exec", "expo", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 0);
