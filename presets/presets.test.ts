// Standalone validation of every custom-service preset in this directory.
// Intentionally has no imports from lib/ or services/ — it carries its own
// copy of the rules so it stays valid even if the sibling item that owns
// the real CustomServiceDefinition schema hasn't landed yet.

import fs from "fs";
import path from "path";

const PRESETS_DIR = __dirname;

const ALLOWED_TOP_LEVEL_KEYS = [
  "auth",
  "login",
  "health",
  "stats",
  "actions",
  "timeoutSeconds",
];

const ACTION_ID_RE = /^[a-z0-9-]+$/;

function loadPresetFiles(): string[] {
  return fs
    .readdirSync(PRESETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

describe("presets/*.json", () => {
  const files = loadPresetFiles();

  it("finds all seven expected presets", () => {
    expect(files).toEqual(
      [
        "audiobookshelf.json",
        "azuracast.json",
        "cleanuparr.json",
        "dozzle.json",
        "home-assistant.json",
        "qbittorrent.json",
        "slskd.json",
      ].sort()
    );
  });

  test.each(files)("%s is valid JSON with only allowed top-level keys", (file) => {
    const raw = fs.readFileSync(path.join(PRESETS_DIR, file), "utf8");

    let parsed: unknown;
    expect(() => {
      parsed = JSON.parse(raw);
    }).not.toThrow();

    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();

    const keys = Object.keys(parsed as Record<string, unknown>);
    for (const key of keys) {
      expect(ALLOWED_TOP_LEVEL_KEYS).toContain(key);
    }
  });

  test.each(files)("%s has a health.path", (file) => {
    const raw = fs.readFileSync(path.join(PRESETS_DIR, file), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    expect(parsed.health).toBeDefined();
    const health = parsed.health as Record<string, unknown>;
    expect(typeof health.path).toBe("string");
    expect((health.path as string).length).toBeGreaterThan(0);
  });

  test.each(files)("%s has at most 8 stats", (file) => {
    const raw = fs.readFileSync(path.join(PRESETS_DIR, file), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (parsed.stats === undefined) return;
    expect(Array.isArray(parsed.stats)).toBe(true);
    expect((parsed.stats as unknown[]).length).toBeLessThanOrEqual(8);
  });

  test.each(files)("%s has at most 8 actions", (file) => {
    const raw = fs.readFileSync(path.join(PRESETS_DIR, file), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (parsed.actions === undefined) return;
    expect(Array.isArray(parsed.actions)).toBe(true);
    expect((parsed.actions as unknown[]).length).toBeLessThanOrEqual(8);
  });

  test.each(files)("%s action ids match /^[a-z0-9-]+$/", (file) => {
    const raw = fs.readFileSync(path.join(PRESETS_DIR, file), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (parsed.actions === undefined) return;
    for (const action of parsed.actions as Record<string, unknown>[]) {
      expect(typeof action.id).toBe("string");
      expect(action.id as string).toMatch(ACTION_ID_RE);
    }
  });
});
