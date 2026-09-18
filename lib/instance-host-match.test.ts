import { hostsOf, sharesHost } from "@/lib/instance-host-match";

const inst = (localUrl: string, remoteUrl = "") => ({ localUrl, remoteUrl });

describe("hostsOf", () => {
  it("collects both URLs' hostnames, ignoring scheme, port and path", () => {
    const hosts = hostsOf(inst("http://192.168.1.10:61208/", "https://glances.example.com"));
    expect([...hosts].sort()).toEqual(["192.168.1.10", "glances.example.com"]);
  });

  it("drops credentials from the authority", () => {
    expect([...hostsOf(inst("http://user:pass@192.168.1.10:61208"))]).toEqual(["192.168.1.10"]);
  });

  it("drops blanks and is empty for a missing instance", () => {
    expect(hostsOf(inst("", "")).size).toBe(0);
    expect(hostsOf(undefined).size).toBe(0);
  });
});

describe("sharesHost", () => {
  it("matches the same host on different ports", () => {
    expect(sharesHost(inst("http://192.168.1.10"), inst("http://192.168.1.10:61208"))).toBe(true);
  });

  it("matches on the local URL when the remote hostnames differ (reverse proxy)", () => {
    expect(
      sharesHost(
        inst("http://192.168.1.10", "https://unraid.example.com"),
        inst("http://192.168.1.10:61208", "https://glances.example.com"),
      ),
    ).toBe(true);
  });

  it("matches on the remote URL when only that is configured", () => {
    expect(
      sharesHost(inst("", "https://box.example.com"), inst("", "https://box.example.com:61208")),
    ).toBe(true);
  });

  it("is case-insensitive on hostnames", () => {
    expect(sharesHost(inst("http://Tower.local"), inst("http://tower.LOCAL:61208"))).toBe(true);
  });

  it("does not match different hosts", () => {
    expect(sharesHost(inst("http://192.168.1.10"), inst("http://10.0.0.5:61208"))).toBe(false);
    expect(
      sharesHost(inst("http://192.168.1.10"), inst("https://elsewhere.example.com")),
    ).toBe(false);
  });

  it("never matches when either side has no usable URL", () => {
    expect(sharesHost(inst("", ""), inst("http://192.168.1.10"))).toBe(false);
    expect(sharesHost(inst("http://192.168.1.10"), inst("", ""))).toBe(false);
    expect(sharesHost(undefined, inst("http://192.168.1.10"))).toBe(false);
    expect(sharesHost(inst("http://192.168.1.10"), undefined)).toBe(false);
  });

  // The reason the unRAID → Glances pairing is stored explicitly rather than
  // derived from this: one public hostname can forward different ports to
  // different machines, and nothing here can tell that apart from one machine
  // serving two ports. Documented as a test so the limitation stays visible.
  it("cannot tell one host forwarding ports to two machines from one machine", () => {
    expect(
      sharesHost(inst("", "https://home.example.com"), inst("", "https://home.example.com:61208")),
    ).toBe(true);
  });
});
