import { matchesHomeNetwork, sameWifiIdentity } from "./home-network-match";

describe("matchesHomeNetwork", () => {
  const ssidOnly = [{ ssid: "Home", bssid: "" }];
  const pinned = [{ ssid: "Home", bssid: "aa:bb:cc" }];

  it("never matches a null identity (off WiFi / VPN-masked / not yet evaluated)", () => {
    expect(matchesHomeNetwork(null, ssidOnly)).toBe(false);
  });

  it("never matches an empty network list", () => {
    expect(matchesHomeNetwork({ ssid: "Home", bssid: "" }, [])).toBe(false);
  });

  it("matches on SSID alone when no BSSID is pinned", () => {
    expect(matchesHomeNetwork({ ssid: "Home", bssid: "" }, ssidOnly)).toBe(true);
    expect(matchesHomeNetwork({ ssid: "Cafe", bssid: "" }, ssidOnly)).toBe(false);
  });

  it("requires a pinned BSSID to match, and fails closed when the OS hides it", () => {
    expect(matchesHomeNetwork({ ssid: "Home", bssid: "aa:bb:cc" }, pinned)).toBe(true);
    expect(matchesHomeNetwork({ ssid: "Home", bssid: "dd:ee:ff" }, pinned)).toBe(false);
    expect(matchesHomeNetwork({ ssid: "Home", bssid: "" }, pinned)).toBe(false);
  });
});

describe("sameWifiIdentity", () => {
  it("treats two nulls as equal and null vs identity as different", () => {
    expect(sameWifiIdentity(null, null)).toBe(true);
    expect(sameWifiIdentity(null, { ssid: "Home", bssid: "" })).toBe(false);
  });

  it("compares by value", () => {
    expect(
      sameWifiIdentity({ ssid: "Home", bssid: "a" }, { ssid: "Home", bssid: "a" }),
    ).toBe(true);
    expect(
      sameWifiIdentity({ ssid: "Home", bssid: "a" }, { ssid: "Home", bssid: "b" }),
    ).toBe(false);
  });
});
