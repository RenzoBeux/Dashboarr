import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * CSRF gate for the web UI's mutating routes.
 *
 * The session cookie is SameSite=Strict, which already keeps a cross-site
 * page from sending it, and Fastify's JSON-only body parser rejects HTML form
 * posts. DELETE has no body, though, and defence in depth is cheap:
 *
 * - When the browser sends `Sec-Fetch-Site` (Chrome 76+, Firefox 90+, Safari
 *   16.4+; page scripts cannot forge it) only `same-origin` passes. `none`
 *   is for address-bar navigations, which are never PUT/DELETE, and
 *   `same-site` would let a sibling subdomain through.
 * - Older browsers: a same-origin fetch with a non-GET method always carries
 *   `Origin`, so require it and compare its host (with port) to the host the
 *   request arrived on. Behind a proxy that rewrites Host (nginx's default
 *   `proxy_set_header Host $proxy_host`) this needs TRUST_PROXY=true so
 *   X-Forwarded-Host is honoured; every current browser takes the first branch
 *   and never hits this.
 */
export async function requireSameOrigin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const secFetchSite = request.headers["sec-fetch-site"];
  const origin = request.headers.origin;
  let ok: boolean;
  if (typeof secFetchSite === "string") {
    ok = secFetchSite === "same-origin";
  } else if (typeof origin === "string") {
    ok = originHost(origin) === request.host;
  } else {
    ok = false;
  }
  if (!ok) {
    request.log.warn({ ip: request.ip, origin, secFetchSite }, "web UI write rejected: cross-origin");
    await reply.code(403).send({ error: "cross_origin" });
  }
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
