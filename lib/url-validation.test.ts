import {
  validateServiceUrl,
  normalizeServiceUrl,
  resolveActiveUrlKind,
  isRemoteOnlyOffline,
  isPrivateHost,
  isPrivateUrl,
} from "./url-validation";

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

describe("isPrivateHost / isPrivateUrl — off-WiFi LAN guard (#106)", () => {
  it("flags RFC1918, loopback, link-local and ULA hosts", () => {
    for (const h of [
      "192.168.1.50",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.254",
      "127.0.0.1",
      "localhost",
      "169.254.1.1",
      "fe80::1",
      "fd12:3456::1",
      "nas.local",
      "NAS.LOCAL",
    ]) {
      expect(isPrivateHost(h)).toBe(true);
    }
  });

  it("does NOT flag public hosts or Tailscale CGNAT (must stay reachable off-LAN)", () => {
    for (const h of [
      "remote.example.com",
      "radarr.mydomain.net",
      "100.64.0.1", // Tailscale CGNAT — routed everywhere
      "100.115.92.3",
      "172.15.0.1", // just below the private 172.16 range
      "172.32.0.1", // just above it
      "8.8.8.8",
      "1.1.1.1",
    ]) {
      expect(isPrivateHost(h)).toBe(false);
    }
  });

  it("isPrivateUrl parses host out of full URLs (scheme, port, IPv6 brackets)", () => {
    expect(isPrivateUrl("http://192.168.1.10:7878")).toBe(true);
    expect(isPrivateUrl("192.168.1.10:7878")).toBe(true); // no scheme
    expect(isPrivateUrl("https://[fd00::1]:8989")).toBe(true);
    expect(isPrivateUrl("https://remote.example.com:443/api")).toBe(false);
    expect(isPrivateUrl("https://100.64.0.1:7878")).toBe(false);
    expect(isPrivateUrl("")).toBe(false);
    expect(isPrivateUrl("not a url")).toBe(false);
  });
});

describe("resolveActiveUrlKind", () => {
  const inst = (over: Partial<{ localUrl: string; remoteUrl: string; useRemote: boolean }> = {}) => ({
    localUrl: "192.168.1.10:7878",
    remoteUrl: "https://remote.example.com",
    useRemote: false,
    ...over,
  });

  it("returns null when neither URL is configured", () => {
    expect(resolveActiveUrlKind({ localUrl: "", remoteUrl: "", useRemote: false }, true, false)).toBeNull();
  });

  it("is remote when the per-instance useRemote override is set", () => {
    expect(resolveActiveUrlKind(inst({ useRemote: true }), true, false)).toBe("remote");
  });

  it("falls back to local when useRemote is set but no remote is configured", () => {
    expect(resolveActiveUrlKind(inst({ useRemote: true, remoteUrl: "" }), true, false)).toBe("local");
  });

  it("is local when auto-switch is off (uses local regardless of network)", () => {
    expect(resolveActiveUrlKind(inst(), false, true)).toBe("local");
  });

  it("falls back to remote when auto-switch is off and no local is configured", () => {
    expect(resolveActiveUrlKind(inst({ localUrl: "" }), false, true)).toBe("remote");
  });

  it("is remote when away from home (no local fallback — the security invariant)", () => {
    expect(resolveActiveUrlKind(inst(), true, true)).toBe("remote");
  });

  it("is local on a confirmed home network", () => {
    expect(resolveActiveUrlKind(inst(), true, false)).toBe("local");
  });

  it("falls back to remote at home when no local is configured", () => {
    expect(resolveActiveUrlKind(inst({ localUrl: "" }), true, false)).toBe("remote");
  });
});

describe("isRemoteOnlyOffline (#168)", () => {
  const inst = (over: Partial<{ localUrl: string; remoteUrl: string; useRemote: boolean }> = {}) => ({
    localUrl: "192.168.1.10:7878",
    remoteUrl: "",
    useRemote: false,
    ...over,
  });

  it("is true when away from home with a local URL but no remote", () => {
    expect(isRemoteOnlyOffline(inst(), true, true)).toBe(true);
  });

  it("is false at home (local URL is usable)", () => {
    expect(isRemoteOnlyOffline(inst(), true, false)).toBe(false);
  });

  it("is false when a remote URL exists (reachable while away)", () => {
    expect(isRemoteOnlyOffline(inst({ remoteUrl: "https://remote.example.com" }), true, true)).toBe(false);
  });

  it("is false when no local URL is configured (just unconfigured, not blocked)", () => {
    expect(isRemoteOnlyOffline(inst({ localUrl: "" }), true, true)).toBe(false);
  });

  it("is false when auto-switch is off (uses local regardless of network)", () => {
    expect(isRemoteOnlyOffline(inst(), false, true)).toBe(false);
  });

  it("is false when the useRemote override is set (falls back to local)", () => {
    expect(isRemoteOnlyOffline(inst({ useRemote: true }), true, true)).toBe(false);
  });

  it("is true when the workspace is pinned to remote-only and no remote URL exists", () => {
    expect(isRemoteOnlyOffline(inst(), false, false, true)).toBe(true);
  });
});
