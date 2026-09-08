// Node-only helper for the route-tree tests (lib/tab-route-tree.test.ts,
// lib/tab-route-resolution.test.ts). Never import from app code.
import fs from "node:fs";
import path from "node:path";

export const APP_DIR = path.join(__dirname, "..", "..", "app");

/** Every file under app/, as a POSIX path relative to app/ (sorted). */
export function listAppRouteFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(APP_DIR, full).split(path.sep).join("/"));
    }
  };
  walk(APP_DIR);
  return out.sort();
}

/** "(tabs)/(a,b)/_layout.tsx" style array-group layout under (tabs). */
export const SHARED_TAB_LAYOUT = /^\(tabs\)\/\(([^/]*,[^/]*)\)\/_layout\.tsx?$/;
