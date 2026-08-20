import { md5 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * HTTP authentication challenge parsing (RFC 7235) and Digest response
 * building (RFC 7616 / RFC 2617).
 *
 * Pure and synchronous: hashing comes from @noble/hashes, which is already a
 * dependency and runs in JS on Hermes, so there is no native module to mock
 * and every branch is unit-testable. Digest bodies are tiny (a few hundred
 * bytes of MD5/SHA-256), so JS hashing costs nothing measurable here.
 */

export interface AuthChallenge {
  scheme: string;
  params: Record<string, string>;
}

// Schemes we are willing to name in a user-facing message. A WWW-Authenticate
// value with an unquoted comma inside an auth-param (seen from hand-rolled
// servers) splits into fragments that look like bare scheme tokens; without
// this allowlist we would tell the user their server "requires def
// authentication". Anything unrecognised is dropped and the caller falls back
// to generic wording.
const KNOWN_SCHEMES = ["basic", "digest", "bearer", "negotiate", "ntlm"];

const TOKEN = "[A-Za-z0-9!#$%&'*+.^_`|~-]";

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
  const paramOnly = new RegExp(`^(${TOKEN}+)\\s*=\\s*([\\s\\S]*)$`);
  const schemeLed = new RegExp(`^(${TOKEN}+)(?:\\s+([\\s\\S]*))?$`);
  const challenges: AuthChallenge[] = [];

  for (const segment of splitSegments(header)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const param = trimmed.match(paramOnly);
    if (param && challenges.length > 0) {
      challenges[challenges.length - 1].params[param[1].toLowerCase()] =
        unquote(param[2]);
      continue;
    }

    const match = trimmed.match(schemeLed);
    if (!match) continue;
    const challenge: AuthChallenge = { scheme: match[1], params: {} };
    // A scheme may carry its first auth-param on the same segment
    // (`Digest realm="x"`) or a token68 blob (`Negotiate YII...`), which has
    // no `=` and is not a param.
    const rest = match[2]?.trim();
    if (rest) {
      const first = rest.match(paramOnly);
      if (first) challenge.params[first[1].toLowerCase()] = unquote(first[2]);
    }
    challenges.push(challenge);
  }

  return challenges;
}

/**
 * Recognised scheme names offered by a WWW-Authenticate value, de-duplicated
 * and in the order the server listed them. Used for user-facing messages, so
 * unrecognised tokens are dropped rather than echoed back.
 */
export function listAuthSchemes(header: string): string[] {
  const schemes: string[] = [];
  for (const { scheme } of parseAuthChallenges(header)) {
    const lower = scheme.toLowerCase();
    if (!KNOWN_SCHEMES.includes(lower)) continue;
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

/**
 * Parse the Digest challenge out of a WWW-Authenticate value, or null when the
 * server did not offer Digest. A returned challenge carrying `unsupported`
 * means Digest was offered in a form we cannot answer.
 */
export function parseDigestChallenge(header: string): DigestChallenge | null {
  const found = parseAuthChallenges(header).find(
    (c) => c.scheme.toLowerCase() === "digest",
  );
  if (!found) return null;

  const { params } = found;
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
