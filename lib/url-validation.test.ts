import { validateServiceUrl } from "./url-validation";

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
