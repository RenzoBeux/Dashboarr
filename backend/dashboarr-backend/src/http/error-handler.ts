import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Global error handler. Most routes already return explicit `{ error }`
 * bodies, but any unhandled throw would otherwise flow through Fastify's
 * default handler and echo `err.message` back to the client — potentially
 * leaking SQLite errors, filesystem paths, or future dev-only messages.
 *
 * Lives in its own module (not index.ts, which starts the server on import)
 * so route tests can register the real handler and assert exact bodies.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Validation errors (Fastify's own schema layer) stay 400 with a generic tag.
    if (err.validation) {
      return reply.code(400).send({ error: "invalid_payload" });
    }
    // A body over the (per-route or global) bodyLimit. Named so the app can
    // show "backup too large" instead of a framework error code.
    if (err.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send({ error: "payload_too_large" });
    }
    // Rate-limit and other intentional 4xx replies keep their codes but
    // return a neutral body so we don't echo framework-authored strings.
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code ?? "client_error" });
    }
    // Anything else → log the real error, respond with a neutral 500.
    request.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "internal_error" });
  });
}

