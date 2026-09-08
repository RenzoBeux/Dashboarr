import {
  validateCustomServiceDefinition,
  redactCustomServiceDefinition,
  type CustomServiceDefinition,
} from "@/lib/custom-service";

function fullValidDefinition(): CustomServiceDefinition {
  return {
    auth: {
      mode: "bearer",
      token: "secret-token",
    },
    login: {
      method: "POST",
      path: "/auth/login",
      contentType: "application/json",
      body: '{"password":"secret"}',
      captureCookie: "session",
      captureJSONPath: "$.token",
      injectAs: "bearer",
      injectName: "Authorization",
    },
    health: {
      method: "GET",
      path: "/health",
      statusPath: "$.status",
      okValues: ["ok", "healthy"],
      warnValues: ["degraded"],
      versionPath: "$.version",
    },
    stats: [
      { label: "Queue size", path: "$.queue.length", unit: "items", format: "number" },
      { label: "Uptime", path: "$.uptime", format: "duration" },
    ],
    actions: [
      { id: "restart", label: "Restart", method: "POST", path: "/restart", confirm: true },
      { id: "clear-cache", label: "Clear cache", method: "DELETE", path: "/cache" },
    ],
    timeoutSeconds: 15,
  };
}

describe("validateCustomServiceDefinition", () => {
  it("accepts a full valid definition", () => {
    const result = validateCustomServiceDefinition(fullValidDefinition());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(fullValidDefinition());
    }
  });

  it("accepts an empty definition — every field is optional", () => {
    const result = validateCustomServiceDefinition({});
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object input", () => {
    expect(validateCustomServiceDefinition(null).ok).toBe(false);
    expect(validateCustomServiceDefinition("nope").ok).toBe(false);
    expect(validateCustomServiceDefinition([]).ok).toBe(false);
  });

  it("rejects more than 8 stats", () => {
    const stats = Array.from({ length: 9 }, (_, i) => ({
      label: `Stat ${i}`,
      path: `$.stat${i}`,
    }));
    const result = validateCustomServiceDefinition({ stats });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /stats.*8/.test(e))).toBe(true);
    }
  });

  it("accepts exactly 8 stats", () => {
    const stats = Array.from({ length: 8 }, (_, i) => ({
      label: `Stat ${i}`,
      path: `$.stat${i}`,
    }));
    const result = validateCustomServiceDefinition({ stats });
    expect(result.ok).toBe(true);
  });

  it("rejects an action id with spaces", () => {
    const result = validateCustomServiceDefinition({
      actions: [
        { id: "clear cache", label: "Clear cache", method: "POST", path: "/clear" },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /actions\[0\]\.id/.test(e))).toBe(true);
    }
  });

  it("rejects more than 8 actions", () => {
    const actions = Array.from({ length: 9 }, (_, i) => ({
      id: `action-${i}`,
      label: `Action ${i}`,
      method: "GET" as const,
      path: `/action${i}`,
    }));
    const result = validateCustomServiceDefinition({ actions });
    expect(result.ok).toBe(false);
  });

  it("rejects auth without mode", () => {
    const result = validateCustomServiceDefinition({ auth: { token: "abc" } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /auth\.mode/.test(e))).toBe(true);
    }
  });

  it("rejects auth with an unknown mode", () => {
    const result = validateCustomServiceDefinition({ auth: { mode: "oauth2" } });
    expect(result.ok).toBe(false);
  });

  it("rejects login missing a required field", () => {
    const result = validateCustomServiceDefinition({
      login: { method: "POST", path: "/login" }, // missing injectAs
    });
    expect(result.ok).toBe(false);
  });

  it("rejects health with an invalid method", () => {
    const result = validateCustomServiceDefinition({
      health: { method: "PATCH", path: "/health" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-positive timeoutSeconds", () => {
    expect(validateCustomServiceDefinition({ timeoutSeconds: 0 }).ok).toBe(false);
    expect(validateCustomServiceDefinition({ timeoutSeconds: -5 }).ok).toBe(false);
    expect(validateCustomServiceDefinition({ timeoutSeconds: "10" }).ok).toBe(false);
  });
});

describe("redactCustomServiceDefinition", () => {
  it("blanks auth.password, auth.token and login.body", () => {
    const def: CustomServiceDefinition = {
      auth: { mode: "basic", username: "admin", password: "hunter2" },
      login: {
        method: "POST",
        path: "/login",
        body: '{"password":"hunter2"}',
        injectAs: "cookie",
      },
    };
    const redacted = redactCustomServiceDefinition(def);
    expect(redacted.auth?.password).toBe("");
    expect(redacted.auth?.username).toBe("admin");
    expect(redacted.login?.body).toBe("");
    expect(redacted.login?.path).toBe("/login");
  });

  it("blanks a bearer token", () => {
    const def: CustomServiceDefinition = { auth: { mode: "bearer", token: "secret" } };
    expect(redactCustomServiceDefinition(def).auth?.token).toBe("");
  });

  it("does not mutate the input", () => {
    const def: CustomServiceDefinition = {
      auth: { mode: "bearer", token: "secret" },
    };
    redactCustomServiceDefinition(def);
    expect(def.auth?.token).toBe("secret");
  });

  it("is a no-op when there is nothing to redact", () => {
    const def: CustomServiceDefinition = { timeoutSeconds: 10 };
    expect(redactCustomServiceDefinition(def)).toEqual(def);
  });
});
