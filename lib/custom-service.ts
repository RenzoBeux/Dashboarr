/**
 * The `custom` service kind lets a user describe an arbitrary JSON HTTP API
 * (auth, an optional login exchange, a health probe, up to 8 stat readouts,
 * up to 8 actions) instead of shipping a purpose-built integration. This file
 * is the single source of truth for that shape: the TypeScript type, a pure
 * validator, and a redaction helper for anywhere the definition might be
 * logged or displayed.
 *
 * Deliberately dependency-free (no zod, no imports at all) so it can be used
 * from the config store, the migrations, and — eventually — the editor UI and
 * the request runner, without pulling any of them into each other.
 */

export interface CustomServiceAuth {
  mode: "none" | "header" | "query" | "basic" | "bearer";
  headerName?: string;
  queryParam?: string;
  username?: string;
  password?: string;
  token?: string;
}

export interface CustomServiceLogin {
  method: "GET" | "POST";
  path: string;
  contentType?: string;
  body?: string;
  captureCookie?: string;
  captureJSONPath?: string;
  injectAs: "header" | "query" | "cookie" | "bearer";
  injectName?: string;
}

export interface CustomServiceHealth {
  method: "GET" | "POST";
  path: string;
  body?: string;
  statusPath?: string;
  okValues?: string[];
  warnValues?: string[];
  versionPath?: string;
}

export interface CustomServiceStat {
  label: string;
  path: string;
  unit?: string;
  format?: "number" | "bytes" | "duration" | "percent" | "text";
}

export interface CustomServiceAction {
  id: string;
  label: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: string;
  confirm?: boolean;
}

export interface CustomServiceDefinition {
  auth?: CustomServiceAuth;
  login?: CustomServiceLogin;
  health?: CustomServiceHealth;
  stats?: CustomServiceStat[];
  actions?: CustomServiceAction[];
  timeoutSeconds?: number;
}

export type CustomServiceValidationResult =
  | { ok: true; value: CustomServiceDefinition }
  | { ok: false; errors: string[] };

const AUTH_MODES = ["none", "header", "query", "basic", "bearer"] as const;
const LOGIN_METHODS = ["GET", "POST"] as const;
const LOGIN_INJECT_AS = ["header", "query", "cookie", "bearer"] as const;
const HEALTH_METHODS = ["GET", "POST"] as const;
const STAT_FORMATS = ["number", "bytes", "duration", "percent", "text"] as const;
const ACTION_METHODS = ["GET", "POST", "PUT", "DELETE"] as const;

const MAX_STATS = 8;
const MAX_ACTIONS = 8;

// Action ids double as stable keys (widget settings, request de-dup), so they
// are restricted to a URL/JSON-safe charset — the same shape a slug would use.
const ACTION_ID_RE = /^[a-z0-9-]+$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isOneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function validateAuth(
  input: unknown,
  errors: string[],
): CustomServiceAuth | undefined {
  if (!isPlainObject(input)) {
    errors.push("auth must be an object");
    return undefined;
  }
  if (!isOneOf(input.mode, AUTH_MODES)) {
    errors.push(`auth.mode is required and must be one of: ${AUTH_MODES.join(", ")}`);
    return undefined;
  }
  const auth: CustomServiceAuth = { mode: input.mode };
  const stringFields = [
    "headerName",
    "queryParam",
    "username",
    "password",
    "token",
  ] as const;
  for (const field of stringFields) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      errors.push(`auth.${field} must be a string`);
      continue;
    }
    auth[field] = raw;
  }
  return auth;
}

function validateLogin(
  input: unknown,
  errors: string[],
): CustomServiceLogin | undefined {
  if (!isPlainObject(input)) {
    errors.push("login must be an object");
    return undefined;
  }
  let valid = true;
  if (!isOneOf(input.method, LOGIN_METHODS)) {
    errors.push(`login.method is required and must be one of: ${LOGIN_METHODS.join(", ")}`);
    valid = false;
  }
  if (!isNonEmptyString(input.path)) {
    errors.push("login.path is required and must be a non-empty string");
    valid = false;
  }
  if (!isOneOf(input.injectAs, LOGIN_INJECT_AS)) {
    errors.push(`login.injectAs is required and must be one of: ${LOGIN_INJECT_AS.join(", ")}`);
    valid = false;
  }
  if (!valid) return undefined;

  const login: CustomServiceLogin = {
    method: input.method as CustomServiceLogin["method"],
    path: input.path as string,
    injectAs: input.injectAs as CustomServiceLogin["injectAs"],
  };
  const stringFields = [
    "contentType",
    "body",
    "captureCookie",
    "captureJSONPath",
    "injectName",
  ] as const;
  for (const field of stringFields) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      errors.push(`login.${field} must be a string`);
      continue;
    }
    login[field] = raw;
  }
  return login;
}

function validateHealth(
  input: unknown,
  errors: string[],
): CustomServiceHealth | undefined {
  if (!isPlainObject(input)) {
    errors.push("health must be an object");
    return undefined;
  }
  let valid = true;
  if (!isOneOf(input.method, HEALTH_METHODS)) {
    errors.push(`health.method is required and must be one of: ${HEALTH_METHODS.join(", ")}`);
    valid = false;
  }
  if (!isNonEmptyString(input.path)) {
    errors.push("health.path is required and must be a non-empty string");
    valid = false;
  }
  if (!valid) return undefined;

  const health: CustomServiceHealth = {
    method: input.method as CustomServiceHealth["method"],
    path: input.path as string,
  };
  const stringFields = ["body", "statusPath", "versionPath"] as const;
  for (const field of stringFields) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      errors.push(`health.${field} must be a string`);
      continue;
    }
    health[field] = raw;
  }
  const arrayFields = ["okValues", "warnValues"] as const;
  for (const field of arrayFields) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (!isStringArray(raw)) {
      errors.push(`health.${field} must be an array of strings`);
      continue;
    }
    health[field] = raw;
  }
  return health;
}

function validateStat(
  input: unknown,
  index: number,
  errors: string[],
): CustomServiceStat | undefined {
  if (!isPlainObject(input)) {
    errors.push(`stats[${index}] must be an object`);
    return undefined;
  }
  let valid = true;
  if (!isNonEmptyString(input.label)) {
    errors.push(`stats[${index}].label is required and must be a non-empty string`);
    valid = false;
  }
  if (!isNonEmptyString(input.path)) {
    errors.push(`stats[${index}].path is required and must be a non-empty string`);
    valid = false;
  }
  if (input.format !== undefined && !isOneOf(input.format, STAT_FORMATS)) {
    errors.push(`stats[${index}].format must be one of: ${STAT_FORMATS.join(", ")}`);
    valid = false;
  }
  if (!valid) return undefined;

  const stat: CustomServiceStat = {
    label: input.label as string,
    path: input.path as string,
  };
  if (input.unit !== undefined) {
    if (typeof input.unit !== "string") {
      errors.push(`stats[${index}].unit must be a string`);
    } else {
      stat.unit = input.unit;
    }
  }
  if (input.format !== undefined) {
    stat.format = input.format as CustomServiceStat["format"];
  }
  return stat;
}

function validateStats(
  input: unknown,
  errors: string[],
): CustomServiceStat[] | undefined {
  if (!Array.isArray(input)) {
    errors.push("stats must be an array");
    return undefined;
  }
  if (input.length > MAX_STATS) {
    errors.push(`stats cannot have more than ${MAX_STATS} entries`);
    return undefined;
  }
  const out: CustomServiceStat[] = [];
  let valid = true;
  input.forEach((item, index) => {
    const stat = validateStat(item, index, errors);
    if (stat) out.push(stat);
    else valid = false;
  });
  return valid ? out : undefined;
}

function validateAction(
  input: unknown,
  index: number,
  errors: string[],
): CustomServiceAction | undefined {
  if (!isPlainObject(input)) {
    errors.push(`actions[${index}] must be an object`);
    return undefined;
  }
  let valid = true;
  if (typeof input.id !== "string" || !ACTION_ID_RE.test(input.id)) {
    errors.push(`actions[${index}].id is required and must match ${ACTION_ID_RE}`);
    valid = false;
  }
  if (!isNonEmptyString(input.label)) {
    errors.push(`actions[${index}].label is required and must be a non-empty string`);
    valid = false;
  }
  if (!isOneOf(input.method, ACTION_METHODS)) {
    errors.push(`actions[${index}].method is required and must be one of: ${ACTION_METHODS.join(", ")}`);
    valid = false;
  }
  if (!isNonEmptyString(input.path)) {
    errors.push(`actions[${index}].path is required and must be a non-empty string`);
    valid = false;
  }
  if (!valid) return undefined;

  const action: CustomServiceAction = {
    id: input.id as string,
    label: input.label as string,
    method: input.method as CustomServiceAction["method"],
    path: input.path as string,
  };
  if (input.body !== undefined) {
    if (typeof input.body !== "string") {
      errors.push(`actions[${index}].body must be a string`);
    } else {
      action.body = input.body;
    }
  }
  if (input.confirm !== undefined) {
    if (typeof input.confirm !== "boolean") {
      errors.push(`actions[${index}].confirm must be a boolean`);
    } else {
      action.confirm = input.confirm;
    }
  }
  return action;
}

function validateActions(
  input: unknown,
  errors: string[],
): CustomServiceAction[] | undefined {
  if (!Array.isArray(input)) {
    errors.push("actions must be an array");
    return undefined;
  }
  if (input.length > MAX_ACTIONS) {
    errors.push(`actions cannot have more than ${MAX_ACTIONS} entries`);
    return undefined;
  }
  const out: CustomServiceAction[] = [];
  let valid = true;
  input.forEach((item, index) => {
    const action = validateAction(item, index, errors);
    if (action) out.push(action);
    else valid = false;
  });
  return valid ? out : undefined;
}

/**
 * Pure structural validator for a stored/imported `custom` block. Never
 * throws; always returns either the narrowed, known-good value or the full
 * list of problems found (a block can fail more than one check at once, e.g.
 * an over-long stats array where an entry is also missing its label).
 */
export function validateCustomServiceDefinition(
  input: unknown,
): CustomServiceValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: ["custom service definition must be an object"] };
  }

  const value: CustomServiceDefinition = {};

  if (input.auth !== undefined) {
    const auth = validateAuth(input.auth, errors);
    if (auth) value.auth = auth;
  }
  if (input.login !== undefined) {
    const login = validateLogin(input.login, errors);
    if (login) value.login = login;
  }
  if (input.health !== undefined) {
    const health = validateHealth(input.health, errors);
    if (health) value.health = health;
  }
  if (input.stats !== undefined) {
    const stats = validateStats(input.stats, errors);
    if (stats) value.stats = stats;
  }
  if (input.actions !== undefined) {
    const actions = validateActions(input.actions, errors);
    if (actions) value.actions = actions;
  }
  if (input.timeoutSeconds !== undefined) {
    if (
      typeof input.timeoutSeconds === "number" &&
      Number.isFinite(input.timeoutSeconds) &&
      input.timeoutSeconds > 0
    ) {
      value.timeoutSeconds = input.timeoutSeconds;
    } else {
      errors.push("timeoutSeconds must be a positive number");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

/**
 * Returns a copy of `def` with secrets blanked out — auth.password/token and
 * the login request body (which often carries the password for a form-post
 * login flow). Used anywhere a definition might be logged, displayed, or
 * included in a bug-report export. Never mutates the input.
 */
export function redactCustomServiceDefinition(
  def: CustomServiceDefinition,
): CustomServiceDefinition {
  const out: CustomServiceDefinition = { ...def };
  if (out.auth) {
    out.auth = { ...out.auth };
    if (out.auth.password !== undefined) out.auth.password = "";
    if (out.auth.token !== undefined) out.auth.token = "";
  }
  if (out.login) {
    out.login = { ...out.login };
    if (out.login.body !== undefined) out.login.body = "";
  }
  return out;
}
