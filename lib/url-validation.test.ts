import { validateServiceUrl, normalizeServiceUrl } from "./url-validation";

describe("validateServiceUrl", () => {
  describe("empty input", () => {
    it("returns ok for an empty string", () => {
      expect(validateServiceUrl("", "local")).toEqual({ kind: "ok" });
      expect(validateServiceUrl("", "remote")).toEqual({ kind: "ok" });
    });

    it("returns ok for whitespace-only input (trimmed)", () => {
      expect(validateServiceUrl("   ", "local")).toEqual({ kind: "ok" });
      expect(validateServiceUrl("\t\n", "remote")).toEqual({ kind: "ok" });
    });
  });

  describe("invalid input", () => {
    it("rejects a non-URL string", () => {
      const result = validateServiceUrl("not-a-url", "local");
      expect(result.kind).toBe("invalid");
    });

    it("rejects ftp://", () => {
      const result = validateServiceUrl("ftp://example.com", "local");
      expect(result.kind).toBe("invalid");
      if (result.kind === "invalid") {
        expect(result.message).toContain("ftp:");
      }
    });

    it("rejects javascript:alert(1)", () => {
      const result = validateServiceUrl("javascript:alert(1)", "local");
      expect(result.kind).toBe("invalid");
      if (result.kind === "invalid") {
        expect(result.message).toContain("javascript:");
      }
    });

    it("rejects file:///etc/passwd", () => {
      const result = validateServiceUrl("file:///etc/passwd", "local");
      expect(result.kind).toBe("invalid");
      if (result.kind === "invalid") {
        expect(result.message).toContain("file:");
      }
    });
  });

  describe("local mode", () => {
    it("returns ok for http://192.168.1.10:7878", () => {
      expect(validateServiceUrl("http://192.168.1.10:7878", "local")).toEqual({
        kind: "ok",
      });
    });

    it("returns ok for https://", () => {
      expect(validateServiceUrl("https://radarr.local", "local")).toEqual({
        kind: "ok",
      });
    });
  });

  describe("remote mode", () => {
    it("returns warn for http://", () => {
      const result = validateServiceUrl("http://example.com", "remote");
      expect(result.kind).toBe("warn");
      if (result.kind === "warn") {
        expect(result.message.toLowerCase()).toContain("cleartext");
      }
    });

    it("returns ok for https://", () => {
      expect(validateServiceUrl("https://example.com", "remote")).toEqual({
        kind: "ok",
      });
    });
  });
});

describe("normalizeServiceUrl", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeServiceUrl("")).toBe("");
    expect(normalizeServiceUrl("  ")).toBe("");
  });

  it("leaves http:// URLs alone", () => {
    expect(normalizeServiceUrl("http://localhost:8989")).toBe("http://localhost:8989");
  });

  it("leaves https:// URLs alone", () => {
    expect(normalizeServiceUrl("https://example.com")).toBe("https://example.com");
  });

  it("prepends http:// to hostnames", () => {
    expect(normalizeServiceUrl("localhost:8989")).toBe("http://localhost:8989");
    expect(normalizeServiceUrl("192.168.1.100:8080")).toBe("http://192.168.1.100:8080");
    expect(normalizeServiceUrl("my-service.local")).toBe("http://my-service.local");
  });

  it("trims input", () => {
    expect(normalizeServiceUrl("  localhost:8989  ")).toBe("http://localhost:8989");
  });
});
