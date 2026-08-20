import { md5 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { randomHex } from "@/lib/random";

/**
 * HTTP authentication: Basic header construction, challenge parsing (RFC 7235)
 * and Digest response building (RFC 7616 / RFC 2617).
 *
 * Pure and synchronous: hashing comes from @noble/hashes, which is already a
 * dependency and runs in JS on Hermes, so there is no native module to mock
 * and every branch is unit-testable. Digest bodies are tiny (a few hundred
 * bytes of MD5/SHA-256), so JS hashing costs nothing measurable here.
 */

/**
 * The `Authorization: Basic …` value for a credential pair, or undefined when
 * there is nothing to send.
 *
 * Every HTTP-auth service goes through this instead of inlining the btoa: the
 * fields are optional on ServiceSecrets and updateInstanceSecrets deletes an
 * empty one, so an inline `btoa(\`${username}:${password}\`)` encodes the
 * literal text "undefined" for a token-in-password setup after the next app
 * launch. Either field alone is enough to send — requiring both made Test
 * Connection pass while every real request 401'd.
 */
export function basicAuthHeader(
  username: string | undefined,
  password: string | undefined,
): string | undefined {
  const user = username ?? "";
  const pass = password ?? "";
  if (!user && !pass) return undefined;
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

export interface AuthChallenge {
  scheme: string;
  params: Record<string, string>;
  /** The opaque blob of a token68 challenge (`Negotiate YII…`), if any. */
  token68?: string;
}

// Schemes we phrase well in a user-facing message. Anything else is echoed
// back only when it looks like a real challenge — see listAuthSchemes.
const KNOWN_SCHEMES = ["basic", "digest", "bearer", "negotiate", "ntlm"];

const TOKEN = "[A-Za-z0-9!#$%&'*+.^_`|~-]";
const PARAM_ONLY = new RegExp(`^(${TOKEN}+)\\s*=\\s*([\\s\\S]*)$`);
const SCHEME_LED = new RegExp(`^(${TOKEN}+)(?:\\s+([\\s\\S]*))?$`);
// RFC 7235 token68: `1*(ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/") *"="`.
// The trailing padding is part of the blob, which is why `Negotiate YII0BQ==`
// must not be shredded into a `yii0bq` auth-param.
const TOKEN68 = /^[A-Za-z0-9\-._~+/]+=*$/;
// Shape an unrecognised scheme name must have before we repeat it to the user.
const SCHEME_NAME = /^[A-Za-z][A-Za-z0-9._-]{0,31}$/;

/**
 * Split a WWW-Authenticate value on commas that are not inside a quoted
 * string. Both challenges and their auth-params are comma-separated, so the
 * caller re-groups the segments.
 */
function splitSegments(header: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;

  for (let i = 0; i < header.length; i += 1) {
    const char = header[i];
    if (escaped) {
      escaped = false;
    } else if (quoted && char === "\\") {
      escaped = true;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      segments.push(header.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(header.slice(start));
  return segments;
}

/** Strip surrounding quotes and undo quoted-pair escaping. */
function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }
  return trimmed.slice(1, -1).replace(/\\(.)/g, "$1");
}

/** Escape a value for use inside a quoted-string. */
function quote(value: string): string {
  return `"${value.replace(/([\\"])/g, "\\$1")}"`;
}

/**
 * Parse every challenge in a WWW-Authenticate value.
 *
 * `Digest realm="a", nonce="b", Basic realm="c"` yields two challenges: a
 * segment shaped like `key=value` extends the challenge in progress, anything
 * else starts a new one.
 */
export function parseAuthChallenges(header: string): AuthChallenge[] {
  const challenges: AuthChallenge[] = [];

  for (const segment of splitSegments(header)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const param = trimmed.match(PARAM_ONLY);
    if (param && challenges.length > 0) {
      challenges[challenges.length - 1].params[param[1].toLowerCase()] =
        unquote(param[2]);
      continue;
    }

    const match = trimmed.match(SCHEME_LED);
    if (!match) continue;
    const challenge: AuthChallenge = { scheme: match[1], params: {} };
    // A scheme may carry its first auth-param on the same segment
    // (`Digest realm="x"`) or a token68 blob (`Negotiate YII0BQ==`). Test for
    // token68 first: its base64 padding is `=`, so the param regex would
    // otherwise split the blob into a bogus key/value pair.
    const rest = match[2]?.trim();
    if (rest) {
      if (TOKEN68.test(rest)) {
        challenge.token68 = rest;
      } else {
        const first = rest.match(PARAM_ONLY);
        if (first) challenge.params[first[1].toLowerCase()] = unquote(first[2]);
      }
    }
    challenges.push(challenge);
  }

  return challenges;
}

/**
 * Scheme names offered by a WWW-Authenticate value, de-duplicated and in the
 * order the server listed them. Used for user-facing messages.
 *
 * An unrecognised scheme is still named — telling a user their SSO proxy
 * "requires SSO authentication" is the whole point of the message — but only
 * when it looks like a scheme token AND the challenge carries something of its
 * own. A value with an unquoted comma inside an auth-param (seen from
 * hand-rolled servers) splits into bare fragments that look like scheme
 * tokens, and those carry nothing; without the guard we would report that the
 * server "requires def authentication".
 */
export function listAuthSchemes(header: string | AuthChallenge[]): string[] {
  const parsed = typeof header === "string" ? parseAuthChallenges(header) : header;
  const schemes: string[] = [];
  for (const { scheme, params, token68 } of parsed) {
    const lower = scheme.toLowerCase();
    if (!KNOWN_SCHEMES.includes(lower)) {
      if (!SCHEME_NAME.test(scheme)) continue;
      if (Object.keys(params).length === 0 && !token68) continue;
    }
    if (schemes.some((s) => s.toLowerCase() === lower)) continue;
    schemes.push(scheme);
  }
  return schemes;
}

export interface DigestChallenge {
  realm: string;
  nonce: string;
  /** The qop we will answer with, or undefined for a legacy RFC 2069 challenge. */
  qop?: string;
  opaque?: string;
  /** Exactly what the server sent, or undefined when it named none (= MD5). */
  algorithm?: string;
  /** Server says the nonce expired but the credentials were fine — retry silently. */
  stale: boolean;
  /** Set when the challenge is well-formed but Dashboarr cannot answer it. */
  unsupported?: string;
}

const SUPPORTED_ALGORITHMS = ["md5", "md5-sess", "sha-256", "sha-256-sess"];

function toDigestChallenge({ params }: AuthChallenge): DigestChallenge {
  const algorithm = params.algorithm;
  const effectiveAlgorithm = algorithm ?? "MD5";
  // An absent qop is RFC 2069, which we answer without cnonce/nc. A present
  // qop must offer "auth"; auth-int hashes the request body and is not
  // implemented.
  const qopList = params.qop
    ?.split(/\s+|,/)
    .map((q) => q.trim().toLowerCase())
    .filter(Boolean);

  const challenge: DigestChallenge = {
    realm: params.realm ?? "",
    nonce: params.nonce ?? "",
    qop: qopList?.includes("auth") ? "auth" : undefined,
    opaque: params.opaque,
    algorithm,
    stale: params.stale?.toLowerCase() === "true",
  };

  if (!params.realm || !params.nonce) {
    challenge.unsupported = "the challenge is missing a realm or nonce";
  } else if (!SUPPORTED_ALGORITHMS.includes(effectiveAlgorithm.toLowerCase())) {
    challenge.unsupported = `algorithm ${effectiveAlgorithm} is not supported`;
  } else if (qopList && qopList.length > 0 && !qopList.includes("auth")) {
    challenge.unsupported = `quality of protection "${params.qop}" is not supported`;
  }

  return challenge;
}

/**
 * Parse the Digest challenge out of a WWW-Authenticate value, or null when the
 * server did not offer Digest. A returned challenge carrying `unsupported`
 * means Digest was offered only in forms we cannot answer.
 *
 * RFC 7616 section 3.7 has servers offer several Digest challenges in one
 * header, most-secure-first — its own example is SHA-512-256, then SHA-256,
 * then MD5. Taking the first one blindly would refuse a header we can in fact
 * answer, so pick the strongest supported challenge and only report
 * `unsupported` when none qualify.
 */
export function parseDigestChallenge(
  header: string | AuthChallenge[],
): DigestChallenge | null {
  const parsed = typeof header === "string" ? parseAuthChallenges(header) : header;
  const offered = parsed
    .filter((c) => c.scheme.toLowerCase() === "digest")
    .map(toDigestChallenge);
  if (offered.length === 0) return null;
  return offered.find((c) => !c.unsupported) ?? offered[0];
}

function hashHex(algorithm: string, input: string): string {
  const bytes = utf8ToBytes(input);
  return bytesToHex(
    algorithm.toLowerCase().startsWith("sha-256") ? sha256(bytes) : md5(bytes),
  );
}

export interface DigestAuthorizationOptions {
  challenge: DigestChallenge;
  username: string;
  password: string;
  /** HTTP method, uppercase. */
  method: string;
  /** Request target exactly as sent on the wire: path plus query string. */
  uri: string;
  /** Client nonce; unused for a legacy RFC 2069 challenge. */
  cnonce: string;
  /** Nonce count. Must increase for every reuse of the same server nonce. */
  nc: number;
}

/**
 * Build the Authorization header value answering a Digest challenge.
 *
 * Verified against the RFC 2617 section 3.5 and RFC 7616 section 3.9.1 test
 * vectors in http-auth.test.ts.
 */
export function buildDigestAuthorization({
  challenge,
  username,
  password,
  method,
  uri,
  cnonce,
  nc,
}: DigestAuthorizationOptions): string {
  const { realm, nonce, qop, opaque } = challenge;
  // An absent algorithm means MD5 (RFC 7616 section 3.3).
  const algorithm = challenge.algorithm ?? "MD5";
  const ncHex = nc.toString(16).padStart(8, "0");

  let ha1 = hashHex(algorithm, `${username}:${realm}:${password}`);
  if (algorithm.toLowerCase().endsWith("-sess")) {
    ha1 = hashHex(algorithm, `${ha1}:${nonce}:${cnonce}`);
  }
  const ha2 = hashHex(algorithm, `${method}:${uri}`);

  const response = qop
    ? hashHex(algorithm, [ha1, nonce, ncHex, cnonce, qop, ha2].join(":"))
    : hashHex(algorithm, [ha1, nonce, ha2].join(":"));

  const parts = [
    `username=${quote(username)}`,
    `realm=${quote(realm)}`,
    `nonce=${quote(nonce)}`,
    `uri=${quote(uri)}`,
    `response=${quote(response)}`,
  ];
  // Echo the algorithm only when the server named one, matching curl: some
  // older servers reject a parameter they did not offer.
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${ncHex}`, `cnonce=${quote(cnonce)}`);
  }
  if (opaque !== undefined) parts.push(`opaque=${quote(opaque)}`);

  return `Digest ${parts.join(", ")}`;
}

interface DigestSession {
  challenge: DigestChallenge;
  cnonce: string;
  /** Requests sent against this nonce so far. */
  nc: number;
}

// One entry per instance + URL. Reusing the server's nonce with an
// incrementing count is what RFC 7616 expects, and it saves a 401 round trip
// on every request: the torrent list polls every few seconds, so re-doing the
// challenge each time would double rtorrent's traffic.
//
// A session holds no credentials — the Authorization value is recomputed from
// the caller's username/password every time — so editing a password does not
// invalidate an entry, and a nonce issued to the old password keeps working
// with the new one. Only instance deletion leaves an entry with no owner,
// which config-store clears through clearDigestSessions.
const digestSessions = new Map<string, DigestSession>();
// A handful of instances is the realistic ceiling; the cap only exists so a
// long-lived process cannot accumulate entries for URLs it no longer uses.
const MAX_DIGEST_SESSIONS = 32;

/** Cache key for a Digest session. Probes pass the instance they belong to so
 * a successful Test Connection spares the first real request its 401. */
export function digestSessionKey(
  instanceId: string | undefined,
  baseUrl: string,
): string {
  return `${instanceId ?? "probe"}|${baseUrl}`;
}

/** Forget every session for an instance (called when the instance is deleted). */
export function clearDigestSessions(instanceId: string): void {
  const prefix = `${instanceId}|`;
  for (const key of Array.from(digestSessions.keys())) {
    if (key.startsWith(prefix)) digestSessions.delete(key);
  }
}

/** Drop the whole cache. Exported for tests, which share module state. */
export function resetDigestSessions(): void {
  digestSessions.clear();
}

function rememberSession(key: string, session: DigestSession): void {
  digestSessions.delete(key);
  digestSessions.set(key, session);
  while (digestSessions.size > MAX_DIGEST_SESSIONS) {
    // Map iterates in insertion order, so the first key is the least recently
    // established session.
    const oldest = digestSessions.keys().next();
    if (oldest.done) break;
    digestSessions.delete(oldest.value);
  }
}

/** Path plus query exactly as sent on the wire, which is what Digest hashes. */
function requestTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * fetch() that can answer an HTTP Digest challenge (#352).
 *
 * Dashboarr sends Basic. A server configured for Digest (lighttpd
 * auth.backend.htdigest, nginx auth_digest, Apache AuthType Digest) rejects
 * that with 401 plus a challenge; we compute the response and retry once.
 * Everything we cannot answer — no credentials, a Basic-only challenge, an
 * unsupported algorithm or qop, a body we cannot replay — returns the original
 * response so the caller's existing error classification still runs.
 *
 * The first request of a cold session still carries the caller's Basic header,
 * which over plain HTTP puts reusable credentials on the wire before we know
 * the server wants Digest. Withholding it would mean an unauthenticated probe
 * per launch and would make every Basic setup depend on the platform surfacing
 * `www-authenticate` on a 401 — a hard dependency this transport deliberately
 * does not take. docs/guide.html keeps the matching warning about Basic over
 * plain HTTP; once a session is established the header is replaced with the
 * Digest response and Basic stops going out.
 */
export async function fetchWithDigestRetry(
  url: string,
  init: RequestInit,
  headers: Headers,
  username: string | undefined,
  password: string | undefined,
  cacheKey: string,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const uri = requestTarget(url);
  // The retry re-sends the body: a string replays safely, FormData and streams
  // do not.
  const replayable = init.body === undefined || typeof init.body === "string";
  const haveCredentials = Boolean(username || password);

  // Each attempt gets its own Headers copy: mutating one shared instance would
  // rewrite the header of a request that has already gone out.
  const authorized = (session: DigestSession): Headers => {
    const copy = new Headers(headers);
    copy.set(
      "Authorization",
      buildDigestAuthorization({
        challenge: session.challenge,
        username: username ?? "",
        password: password ?? "",
        method,
        uri,
        cnonce: session.cnonce,
        nc: session.nc,
      }),
    );
    return copy;
  };

  const cached = haveCredentials ? digestSessions.get(cacheKey) : undefined;
  if (cached) cached.nc += 1;

  const response = await fetch(url, {
    ...init,
    headers: cached ? authorized(cached) : new Headers(headers),
  });
  if (response.status !== 401 || !haveCredentials || !replayable) {
    return response;
  }

  const challenge = parseDigestChallenge(
    response.headers.get("www-authenticate") ?? "",
  );
  if (!challenge || challenge.unsupported) {
    digestSessions.delete(cacheKey);
    return response;
  }

  const sameNonce = cached?.challenge.nonce === challenge.nonce;
  // Same nonce, no `stale` flag: the server rejected the credentials, not the
  // nonce. Recomputing against the identical nonce would produce the identical
  // verdict, so hand the real challenge back instead of burning a round trip.
  if (cached && sameNonce && !challenge.stale) {
    digestSessions.delete(cacheKey);
    return response;
  }

  // Carry the running count forward when the server handed back the nonce we
  // were already using (a bare `stale=true`). Apache's AuthDigestNcCheck and
  // nginx auth_digest's replay window reject a nonce-count that does not
  // increase, so restarting at 1 would fail the retry outright.
  const session: DigestSession =
    cached && sameNonce
      ? { challenge, cnonce: cached.cnonce, nc: cached.nc + 1 }
      : { challenge, cnonce: randomHex(8), nc: 1 };
  const retried = await fetch(url, { ...init, headers: authorized(session) });
  // Only keep a nonce that actually worked. Caching one after a rejection
  // would send a doomed Authorization header on every later request and hide
  // the real 401 challenge.
  if (retried.status === 401) digestSessions.delete(cacheKey);
  else rememberSession(cacheKey, session);
  return retried;
}
