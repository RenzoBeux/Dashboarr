import { existsSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

/**
 * Serves the Vite bundle of the web UI (built into dist/web by `npm run
 * build:web`) at "/". The bundle is public code, so it is always served; the
 * data behind it is gated by the cookie session in routes/ui.ts.
 *
 * Route safety: @fastify/static registers GET/HEAD "/*". find-my-way prefers
 * static and parametric routes over the wildcard, so /health keeps both of
 * its projections, and the other API routes are POST/PUT and never match. A
 * GET for a missing file falls through reply.callNotFound() to the
 * setNotFoundHandler in index.ts, so the body stays { error: "not_found" }.
 */

/**
 * Same trick as version.ts: this module lives in src/routes/ (tsx) or
 * dist/routes/ (node), so ../../dist/web resolves to <package>/dist/web from
 * both.
 */
export function resolveWebRoot(): string {
  return fileURLToPath(new URL("../../dist/web/", import.meta.url));
}

/** Returns false (and logs once) when the bundle has not been built. */
export async function registerWebStatic(app: FastifyInstance): Promise<boolean> {
  const root = resolveWebRoot();
  if (!existsSync(root)) {
    app.log.warn(`web UI bundle not found at ${root}; run \`npm run build:web\` to serve it`);
    return false;
  }
  await app.register(fastifyStatic, {
    root,
    prefix: "/",
    index: ["index.html"],
    wildcard: true,
    decorateReply: false,
    dotfiles: "ignore",
    setHeaders(reply, filePath) {
      if (filePath.endsWith("index.html")) {
        // The entry must never be cached: hashed asset names change per build.
        reply.header("Cache-Control", "no-cache");
        reply.header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
        reply.header("X-Frame-Options", "DENY");
        reply.header("X-Content-Type-Options", "nosniff");
      } else if (filePath.includes(`${sep}assets${sep}`)) {
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });
  return true;
}
