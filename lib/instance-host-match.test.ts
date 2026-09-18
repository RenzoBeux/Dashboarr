import { findSameHostInstance, hostsOf } from "@/lib/instance-host-match";

const inst = (id: string, localUrl: string, remoteUrl = "") => ({
  id,
  localUrl,
  remoteUrl,
});

describe("hostsOf", () => {
  it("collects both URLs' hostnames, ignoring scheme, port and path", () => {
    const hosts = hostsOf(inst("a", "http://192.168.1.10:61208/", "https://glances.example.com"));
    expect([...hosts].sort()).toEqual(["192.168.1.10", "glances.example.com"]);
  });

  it("drops blanks and is empty for a missing instance", () => {
    expect(hostsOf(inst("a", "", "")).size).toBe(0);
    expect(hostsOf(undefined).size).toBe(0);
  });
});

describe("findSameHostInstance", () => {
  it("matches a Glances on the same host but a different port", () => {
    const target = inst("unraid", "http://192.168.1.10");
    const found = findSameHostInstance(target, [
      inst("glances-vps", "http://10.0.0.5:61208"),
      inst("glances-nas", "http://192.168.1.10:61208"),
    ]);
    expect(found?.id).toBe("glances-nas");
  });

  it("matches on the local URL when the remote hostnames differ (reverse proxy)", () => {
    const target = inst("unraid", "http://192.168.1.10", "https://unraid.example.com");
    const found = findSameHostInstance(target, [
      inst("glances", "http://192.168.1.10:61208", "https://glances.example.com"),
    ]);
    expect(found?.id).toBe("glances");
  });

  it("matches on the remote URL when only that is configured", () => {
    const target = inst("unraid", "", "https://box.example.com");
    const found = findSameHostInstance(target, [inst("glances", "", "https://box.example.com:61208")]);
    expect(found?.id).toBe("glances");
  });

  it("returns undefined when no candidate shares a host", () => {
    const target = inst("unraid", "http://192.168.1.10");
    expect(
      findSameHostInstance(target, [
        inst("glances-vps", "http://10.0.0.5:61208"),
        inst("glances-other", "https://elsewhere.example.com"),
      ]),
    ).toBeUndefined();
  });

  it("is case-insensitive on hostnames", () => {
    const found = findSameHostInstance(inst("unraid", "http://Tower.local"), [
      inst("glances", "http://tower.LOCAL:61208"),
    ]);
    expect(found?.id).toBe("glances");
  });

  it("never matches when the target has no usable URL", () => {
    expect(findSameHostInstance(inst("unraid", "", ""), [inst("glances", "http://x")])).toBeUndefined();
    expect(findSameHostInstance(undefined, [inst("glances", "http://x")])).toBeUndefined();
  });

  it("never matches a candidate with no usable URL", () => {
    expect(
      findSameHostInstance(inst("unraid", "http://192.168.1.10"), [inst("glances", "", "")]),
    ).toBeUndefined();
  });

  it("returns undefined for an empty candidate list", () => {
    expect(findSameHostInstance(inst("unraid", "http://192.168.1.10"), [])).toBeUndefined();
  });
});
