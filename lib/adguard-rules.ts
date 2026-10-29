import type { AdguardFilterStatus } from "@/lib/types";

/**
 * Pure helpers for AdGuard Home's custom filtering rules — the free-text
 * "user rules" box in its web UI (`GET /control/filtering/status`.user_rules
 * and `POST /control/filtering/set_rules`).
 *
 * The wire format is one rule per line, with the whole list REPLACED on
 * every write: set_rules takes the complete array, not a delta. That is why
 * every mutation here is a read-modify-write on a fresh copy of the list
 * (hooks/use-adguard.ts), never on the cached one.
 *
 * Only the two shapes the app writes are parsed structurally — the AdGuard
 * domain-anchor syntax `||example.com^` (block) and `@@||example.com^`
 * (allow/exception), plus hosts-file style blocks (`0.0.0.0 example.com`),
 * which AGH also accepts. Anything else (regexes, `$` modifiers the app did
 * not write, `/path` rules) is kept verbatim as "other" so a user's
 * hand-written rules are never rewritten or dropped. Syntax reference:
 * https://adguard-dns.io/kb/general/dns-filtering-syntax/
 */

export type AdguardRuleKind = "allow" | "block" | "comment" | "other";

export interface ParsedAdguardRule {
  /** The line exactly as stored. */
  text: string;
  kind: AdguardRuleKind;
  /** Lower-cased domain for allow/block domain rules; absent for the rest. */
  domain?: string;
  /** `$important`, `$dnstype=AAAA`, … — kept so the UI can show it. */
  modifiers?: string;
}

// `||domain^` optionally followed by `$modifiers`; `@@` prefix = exception.
// The domain part excludes everything the syntax reserves (`/`, `^`, `$`,
// `|`, whitespace) so a path rule like `||example.com/ads^` is left alone.
const DOMAIN_RULE_RE = /^(@@)?\|\|([^\s/^$|*]+)\^(\$\S*)?$/;
// hosts-file style: unspecified / loopback address + hostname. AGH treats
// these as block rules (internal/filtering/rulelist).
const HOSTS_RULE_RE = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1?)\s+([^\s#]+)\s*(?:#.*)?$/;

// Labels 1-63 chars, no leading/trailing hyphen, 253 total, no trailing dot.
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/i;

export function parseAdguardRule(line: string): ParsedAdguardRule {
  const text = line;
  const trimmed = line.trim();
  if (trimmed === "") return { text, kind: "other" };
  if (trimmed.startsWith("!") || trimmed.startsWith("#")) return { text, kind: "comment" };

  const domainMatch = DOMAIN_RULE_RE.exec(trimmed);
  if (domainMatch) {
    const domain = domainMatch[2]!.toLowerCase();
    const parsed: ParsedAdguardRule = {
      text,
      kind: domainMatch[1] ? "allow" : "block",
      domain,
    };
    if (domainMatch[3]) parsed.modifiers = domainMatch[3];
    return parsed;
  }

  const hostsMatch = HOSTS_RULE_RE.exec(trimmed);
  if (hostsMatch) {
    return { text, kind: "block", domain: hostsMatch[1]!.toLowerCase() };
  }

  return { text, kind: "other" };
}

/**
 * Turn what a user typed (or a query-log domain) into the bare hostname a
 * rule anchors on. Accepts a pasted URL ("https://ads.example.com/x?y") and
 * a trailing-dot FQDN ("ads.example.com."), which the query log can carry.
 * Returns null when nothing hostname-shaped is left.
 */
export function normalizeRuleDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (value === "") return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  value = value.replace(/^[^/?#@]*@/, ""); // userinfo
  value = value.replace(/[/?#].*$/, ""); // path, query, fragment
  value = value.replace(/:\d+$/, ""); // port
  value = value.replace(/^\*\./, ""); // `*.example.com` → `example.com` (|| already covers subdomains)
  value = value.replace(/\.+$/, ""); // trailing dot(s)
  if (value === "" || /\s/.test(value) || !HOSTNAME_RE.test(value)) return null;
  return value;
}

export function allowRuleFor(domain: string): string {
  return `@@||${domain}^`;
}

export function blockRuleFor(domain: string): string {
  return `||${domain}^`;
}

export interface DomainRuleState {
  /** Existing user rules that allow exactly this domain. */
  allow: string[];
  /** Existing user rules that block exactly this domain. */
  block: string[];
}

/**
 * Which user rules already target this exact domain. Exact match only: a
 * rule for `example.com` also covers `ads.example.com` at lookup time, but
 * the app never edits a parent-domain rule on a subdomain's behalf — that
 * would silently change what the user wrote for the whole domain.
 */
export function domainRuleState(
  rules: readonly string[] | undefined,
  domain: string,
): DomainRuleState {
  const target = normalizeRuleDomain(domain);
  const state: DomainRuleState = { allow: [], block: [] };
  if (!target || !Array.isArray(rules)) return state;
  for (const line of rules) {
    const parsed = parseAdguardRule(line);
    if (parsed.domain !== target) continue;
    if (parsed.kind === "allow") state.allow.push(line);
    else if (parsed.kind === "block") state.block.push(line);
  }
  return state;
}

export type AdguardDomainRuleChange = "allow" | "block" | "clear";

export interface DomainRuleEdit {
  /** The full list to send to set_rules. */
  rules: string[];
  /** false when the list already said exactly this — skip the write. */
  changed: boolean;
  /** The rule appended, for allow/block. */
  added?: string;
  /** Every pre-existing rule for the domain that was dropped. */
  removed: string[];
}

/**
 * Apply one change for a domain to a user-rules list. Every existing
 * allow/block rule for that exact domain is removed first — an allow and a
 * block for the same domain would otherwise both exist, and which one wins
 * depends on `$important`, which the user cannot see from the app. Comments
 * and unrelated rules keep their order; the new rule goes at the end.
 */
export function applyDomainRule(
  rules: readonly string[] | undefined,
  domain: string,
  change: AdguardDomainRuleChange,
): DomainRuleEdit {
  const target = normalizeRuleDomain(domain);
  if (!target) throw new Error("Enter a valid domain");
  const current = Array.isArray(rules) ? [...rules] : [];
  const removed: string[] = [];
  const kept: string[] = [];
  for (const line of current) {
    const parsed = parseAdguardRule(line);
    if (parsed.domain === target && (parsed.kind === "allow" || parsed.kind === "block")) {
      removed.push(line);
    } else {
      kept.push(line);
    }
  }

  if (change === "clear") {
    return { rules: kept, changed: removed.length > 0, removed };
  }

  const added = change === "allow" ? allowRuleFor(target) : blockRuleFor(target);
  // Already exactly this one rule, nothing else for the domain → no-op.
  if (removed.length === 1 && removed[0] === added) {
    return { rules: current, changed: false, added, removed: [] };
  }
  return { rules: [...kept, added], changed: true, added, removed };
}

/** Remove one rule line verbatim. `changed` is false when it was not there. */
export function removeRuleLine(
  rules: readonly string[] | undefined,
  line: string,
): { rules: string[]; changed: boolean } {
  const current = Array.isArray(rules) ? rules : [];
  const next = current.filter((r) => r !== line);
  return { rules: next, changed: next.length !== current.length };
}

/** Append a raw rule line, deduplicating an exact repeat. */
export function addRuleLine(
  rules: readonly string[] | undefined,
  line: string,
): { rules: string[]; changed: boolean } {
  const current = Array.isArray(rules) ? [...rules] : [];
  const value = line.trim();
  if (value === "") throw new Error("Enter a rule");
  if (current.includes(value)) return { rules: current, changed: false };
  return { rules: [...current, value], changed: true };
}

export interface RuleSummary {
  allow: number;
  block: number;
  other: number;
  total: number;
}

/** Counts for the tab card. Comments and blank lines are not counted at all. */
export function summarizeRules(rules: readonly string[] | undefined): RuleSummary {
  const summary: RuleSummary = { allow: 0, block: 0, other: 0, total: 0 };
  if (!Array.isArray(rules)) return summary;
  for (const line of rules) {
    const parsed = parseAdguardRule(line);
    if (parsed.kind === "comment" || parsed.text.trim() === "") continue;
    summary.total += 1;
    if (parsed.kind === "allow") summary.allow += 1;
    else if (parsed.kind === "block") summary.block += 1;
    else summary.other += 1;
  }
  return summary;
}

/** Convenience for callers holding a whole filter status. */
export function userRulesOf(status: AdguardFilterStatus | undefined): string[] {
  return Array.isArray(status?.user_rules) ? status.user_rules : [];
}
