import { readFileSync } from "node:fs";

/**
 * Single source of truth for the running backend version: read from
 * package.json at startup so there's nothing to keep in sync by hand. The
 * Dockerfile copies package.json into the runtime image (/app/package.json)
 * next to dist/, so `../package.json` resolves both locally
 * (dist/version.js -> ../package.json) and in the container.
 *
 * Surfaced in the startup log banner and the /health response so an operator
 * can confirm which build is actually running — the `:latest` image tag alone
 * doesn't tell you that.
 */
function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export const VERSION = readVersion();
