import {
  isValidShortcutUrl,
  normalizeShortcutUrl,
  shortcutHostLabel,
  validateShortcutUrl,
} from "./web-shortcuts";

describe("normalizeShortcutUrl", () => {
  it("defaults to https:// when no scheme is given", () => {
    expect(normalizeShortcutUrl("portainer.example.com")).toBe(
      "https://portainer.example.com",
    );
    expect(normalizeShortcutUrl("  192.168.1.10:9000 ")).toBe(
      "https://192.168.1.10:9000",
    );
  });

  it("keeps an explicit scheme, including http://", () => {
    expect(normalizeShortcutUrl("http://192.168.1.10:9000")).toBe(
      "http://192.168.1.10:9000",
    );
    expect(normalizeShortcutUrl("HTTPS://Example.com/x")).toBe("HTTPS://Example.com/x");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeShortcutUrl("   ")).toBe("");
  });
});

describe("isValidShortcutUrl", () => {
  it.each([
    "https://portainer.example.com",
    "http://192.168.1.10:9000/#/containers",
    "https://[fd00::1]:8006",
  ])("accepts %s", (url) => {
    expect(isValidShortcutUrl(url)).toBe(true);
  });

  it.each([
    "",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "portainer.example.com",
    "https://",
    "https://exa mple.com",
    `https://example.com/${"x".repeat(2048)}`,
  ])("rejects %s", (url) => {
    expect(isValidShortcutUrl(url)).toBe(false);
  });
});

describe("validateShortcutUrl", () => {
  it("normalizes then validates", () => {
    expect(validateShortcutUrl(" proxmox.lan:8006 ")).toEqual({
      kind: "ok",
      url: "https://proxmox.lan:8006",
    });
  });

  it("reports a required URL", () => {
    expect(validateShortcutUrl("")).toEqual({ kind: "invalid", message: "URL is required" });
  });

  it("names the scheme problem for non-web schemes", () => {
    const result = validateShortcutUrl("ssh://box");
    expect(result.kind).toBe("invalid");
    expect((result as { message: string }).message).toMatch(/http/);
  });

  it("rejects an unparseable URL", () => {
    expect(validateShortcutUrl("https://exa mple.com").kind).toBe("invalid");
  });
});

describe("shortcutHostLabel", () => {
  it("shows the host with port", () => {
    expect(shortcutHostLabel("http://192.168.1.10:9000/#/containers")).toBe(
      "192.168.1.10:9000",
    );
  });

  it("falls back to the raw string when unparseable", () => {
    expect(shortcutHostLabel("not a url")).toBe("not a url");
  });
});
