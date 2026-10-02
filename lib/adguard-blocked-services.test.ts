import {
  blockedServiceGroupLabel,
  blockedServiceMatches,
  decodeServiceIcon,
  describePauseSchedule,
  groupBlockedServices,
  toggleBlockedService,
} from "@/lib/adguard-blocked-services";

const svg = (name: string) => `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor"><title>${name}</title></svg>`;
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("groupBlockedServices", () => {
  const all = {
    blocked_services: [
      { id: "youtube", name: "YouTube", icon_svg: "", rules: [], group_id: "streaming" },
      { id: "tiktok", name: "TikTok", icon_svg: "", rules: [], group_id: "social_network" },
      { id: "facebook", name: "Facebook", icon_svg: "", rules: [], group_id: "social_network" },
      { id: "steam", name: "Steam", icon_svg: "", rules: [], group_id: "gaming" },
      { id: "mystery", name: "Mystery", icon_svg: "", rules: [] },
      { id: "newthing", name: "New thing", icon_svg: "", rules: [], group_id: "unlisted_group" },
    ],
    groups: [{ id: "social_network" }, { id: "streaming" }, { id: "gaming" }],
  };

  it("keeps the server's group order, sorts services by name, puts strays and Other last", () => {
    const groups = groupBlockedServices(all);
    expect(groups.map((g) => g.id)).toEqual(["social_network", "streaming", "gaming", "unlisted_group", "other"]);
    expect(groups[0]!.label).toBe("Social networks");
    expect(groups[0]!.services.map((s) => s.id)).toEqual(["facebook", "tiktok"]);
    expect(groups[3]!.label).toBe("Unlisted group");
    expect(groups[4]!).toMatchObject({ label: "Other", services: [all.blocked_services[4]] });
  });

  it("is empty with no catalog", () => {
    expect(groupBlockedServices(undefined)).toEqual([]);
  });

  it("labels known and unknown groups", () => {
    expect(blockedServiceGroupLabel("messenger")).toBe("Messengers");
    expect(blockedServiceGroupLabel("some_new_group")).toBe("Some new group");
    expect(blockedServiceGroupLabel(undefined)).toBe("Other");
  });
});

describe("toggleBlockedService", () => {
  it("adds, removes, and leaves alone", () => {
    expect(toggleBlockedService(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleBlockedService(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggleBlockedService(["a"], "a", true)).toEqual(["a"]);
    expect(toggleBlockedService(undefined, "a", false)).toEqual([]);
  });
});

describe("decodeServiceIcon", () => {
  it("decodes a Base64 SVG", () => {
    expect(decodeServiceIcon(b64(svg("YouTube")))).toBe(svg("YouTube"));
  });
  it("returns null for empty, non-SVG or undecodable input", () => {
    expect(decodeServiceIcon(undefined)).toBeNull();
    expect(decodeServiceIcon("")).toBeNull();
    expect(decodeServiceIcon(b64("<html></html>"))).toBeNull();
    expect(decodeServiceIcon("%%%not-base64%%%")).toBeNull();
  });
});

describe("describePauseSchedule", () => {
  const H = 3_600_000;
  it("is null with no windows", () => {
    expect(describePauseSchedule(undefined)).toBeNull();
    expect(describePauseSchedule({ time_zone: "Local" })).toBeNull();
    expect(describePauseSchedule({ mon: { start: 0, end: 0 } })).toBeNull();
  });
  it("collapses consecutive days with the same window", () => {
    expect(
      describePauseSchedule({
        time_zone: "Local",
        mon: { start: 15 * H, end: 17 * H },
        tue: { start: 15 * H, end: 17 * H },
        wed: { start: 15 * H, end: 17 * H },
        thu: { start: 15 * H, end: 17 * H },
        fri: { start: 15 * H, end: 17 * H },
        sat: { start: 10 * H, end: 12 * H + 30 * 60_000 },
      }),
    ).toBe("Paused Mon–Fri 15:00–17:00, Sat 10:00–12:30");
  });
  it("names two days, shows a to-midnight window as 24:00, and a non-local zone", () => {
    expect(
      describePauseSchedule({
        time_zone: "America/Denver",
        sat: { start: 0, end: 24 * H },
        sun: { start: 0, end: 24 * H },
      }),
    ).toBe("Paused Sat, Sun 00:00–24:00 (America/Denver)");
  });
});

describe("blockedServiceMatches", () => {
  const svc = { id: "tiktok", name: "TikTok", icon_svg: "", rules: [] };
  it("matches name or id, case-insensitively, and everything on empty", () => {
    expect(blockedServiceMatches(svc, "tik")).toBe(true);
    expect(blockedServiceMatches(svc, "TOK")).toBe(true);
    expect(blockedServiceMatches(svc, "")).toBe(true);
    expect(blockedServiceMatches(svc, "youtube")).toBe(false);
  });
});
