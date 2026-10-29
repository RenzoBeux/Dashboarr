import {
  CATEGORIES_FOR_KIND,
  CATEGORY_LABELS,
  LEGACY_BACKEND_NOTIF_CATEGORIES,
  NOTIF_CATEGORIES,
  restrictPerInstanceCategories,
  shouldNotifyForInstance,
} from "@/lib/notification-categories";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/config-defaults";

describe("grab categories (#464)", () => {
  it("are surfaced on the Radarr and Sonarr instance editors", () => {
    expect(CATEGORIES_FOR_KIND.radarr).toContain("radarrGrabbed");
    expect(CATEGORIES_FOR_KIND.sonarr).toContain("sonarrGrabbed");
    expect(CATEGORIES_FOR_KIND.lidarr).not.toContain("radarrGrabbed");
  });

  it("have labels and are listed in NOTIF_CATEGORIES", () => {
    expect(CATEGORY_LABELS.radarrGrabbed).toBe("Movie grabbed");
    expect(CATEGORY_LABELS.sonarrGrabbed).toBe("Episode grabbed");
    expect(NOTIF_CATEGORIES).toEqual(expect.arrayContaining(["radarrGrabbed", "sonarrGrabbed"]));
  });

  it("are off by default but a per-instance override turns them on", () => {
    expect(shouldNotifyForInstance("radarrGrabbed", "r1", DEFAULT_NOTIFICATION_SETTINGS)).toBe(false);
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, perInstance: { r1: { radarrGrabbed: true } } };
    expect(shouldNotifyForInstance("radarrGrabbed", "r1", settings)).toBe(true);
    expect(shouldNotifyForInstance("radarrGrabbed", "r2", settings)).toBe(false);
  });
});

describe("LEGACY_BACKEND_NOTIF_CATEGORIES", () => {
  it("is the frozen v1.9.0 backend enum, without the newer categories", () => {
    expect(LEGACY_BACKEND_NOTIF_CATEGORIES).toHaveLength(14);
    expect(LEGACY_BACKEND_NOTIF_CATEGORIES).not.toContain("radarrGrabbed");
    expect(LEGACY_BACKEND_NOTIF_CATEGORIES).not.toContain("sonarrGrabbed");
    for (const cat of LEGACY_BACKEND_NOTIF_CATEGORIES) {
      expect(NOTIF_CATEGORIES).toContain(cat);
    }
  });
});

describe("restrictPerInstanceCategories", () => {
  it("keeps the allowed overrides and drops the rest", () => {
    expect(
      restrictPerInstanceCategories(
        {
          r1: { radarrDownloaded: false, radarrGrabbed: true },
          s1: { sonarrGrabbed: true, serviceOffline: false },
        },
        LEGACY_BACKEND_NOTIF_CATEGORIES,
      ),
    ).toEqual({ r1: { radarrDownloaded: false }, s1: { serviceOffline: false } });
  });

  it("drops instances left without overrides and returns undefined when none remain", () => {
    expect(
      restrictPerInstanceCategories(
        { r1: { radarrGrabbed: true }, q1: { torrentCompleted: false } },
        LEGACY_BACKEND_NOTIF_CATEGORIES,
      ),
    ).toEqual({ q1: { torrentCompleted: false } });
    expect(
      restrictPerInstanceCategories({ r1: { radarrGrabbed: true } }, LEGACY_BACKEND_NOTIF_CATEGORIES),
    ).toBeUndefined();
    expect(restrictPerInstanceCategories({ r1: {} }, LEGACY_BACKEND_NOTIF_CATEGORIES)).toBeUndefined();
  });

  it("passes undefined through and never mutates its input", () => {
    expect(restrictPerInstanceCategories(undefined, LEGACY_BACKEND_NOTIF_CATEGORIES)).toBeUndefined();
    const input = { r1: { radarrDownloaded: true, radarrGrabbed: true } };
    restrictPerInstanceCategories(input, LEGACY_BACKEND_NOTIF_CATEGORIES);
    expect(input).toEqual({ r1: { radarrDownloaded: true, radarrGrabbed: true } });
  });
});
