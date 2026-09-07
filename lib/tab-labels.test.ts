import fs from "node:fs";
import path from "node:path";
import { ALL_TAB_ROUTE_IDS, TAB_LABELS } from "@/lib/tab-routes";
import { APP_DIR } from "@/lib/testing/app-route-files";

// The bottom bar hides its labels, so TAB_LABELS is the only accessible name a
// tab has. Without it React Navigation falls back to the route name, which
// since #330 is the group name "(tv)".
describe("TAB_LABELS", () => {
  it("covers exactly the tab route ids", () => {
    expect(Object.keys(TAB_LABELS).sort()).toEqual([...ALL_TAB_ROUTE_IDS].sort());
  });

  it("never falls back to a route or group name", () => {
    for (const id of ALL_TAB_ROUTE_IDS) {
      const label = TAB_LABELS[id];
      expect({ id, label }).toEqual({ id, label: label.trim() });
      expect(label.length).toBeGreaterThan(0);
      // "(tv)" and "tv" are exactly what React Navigation announces without
      // a label, so neither form is an acceptable value here.
      expect(label).not.toContain("(");
      expect(label).not.toBe(id);
    }
  });

  it("keeps labels distinct so tabs are distinguishable by name", () => {
    const lower = ALL_TAB_ROUTE_IDS.map((id) => TAB_LABELS[id].toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});

describe("TAB_LABELS wiring", () => {
  const read = (rel: string) => fs.readFileSync(path.join(APP_DIR, rel), "utf8");

  // Text assertions, same style as lib/tab-route-tree.test.ts: nothing in this
  // repo renders components, and a missing label is invisible until someone
  // turns on a screen reader.
  it("labels all three Tabs.Screen declarations in the bar", () => {
    const source = read("(tabs)/_layout.tsx");
    for (const key of ["dashboard", "[name]", "settings"]) {
      const suffix = key === "[name]" ? "[name]" : `.${key}`;
      expect(source).toContain(`title: TAB_LABELS${suffix}`);
      expect(source).toContain(`tabBarAccessibilityLabel: TAB_LABELS${suffix}`);
    }
  });

  it("has no second copy of the map in the dashboard editor", () => {
    expect(read("dashboard-edit/[id].tsx")).not.toMatch(/const TAB_LABELS/);
  });
});
