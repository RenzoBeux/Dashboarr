import fs from "node:fs";
import path from "node:path";
import { ALL_TAB_ROUTE_IDS } from "@/lib/tab-routes";
import { APP_DIR, SHARED_TAB_LAYOUT, listAppRouteFiles } from "@/lib/testing/app-route-files";

// Guards the file tree behind the per-tab stacks (#330): every tab id owns a
// group dir with its root screen, the shared layout's array group lists
// exactly the tab ids, and no screen sneaks back onto the root stack.
const files = listAppRouteFiles();
const tabIds = new Set<string>(ALL_TAB_ROUTE_IDS);

describe("tab route tree", () => {
  it("every tab id owns app/(tabs)/(<id>)/<id>.tsx", () => {
    for (const id of ALL_TAB_ROUTE_IDS) {
      expect(files).toContain(`(tabs)/(${id})/${id}.tsx`);
    }
  });

  it("has exactly one shared tab layout, covering exactly the tab ids", () => {
    const layouts = files.filter((f) => SHARED_TAB_LAYOUT.test(f));
    expect(layouts).toHaveLength(1);
    const groups = SHARED_TAB_LAYOUT.exec(layouts[0])![1].split(",");
    expect(new Set(groups)).toEqual(tabIds);
    expect(groups.length).toBe(tabIds.size);
    const source = fs.readFileSync(path.join(APP_DIR, layouts[0]), "utf8");
    expect(source).toMatch(/export const unstable_settings = TAB_STACK_ANCHORS;/);
  });

  it("has no per-group _layout.tsx beside the shared one (expo-router throws)", () => {
    expect(files.filter((f) => /^\(tabs\)\/\([^,/]+\)\/_layout\.tsx?$/.test(f))).toEqual([]);
  });

  it("only uses known tab ids in array groups", () => {
    for (const file of files) {
      const match = /^\(tabs\)\/\(([^/]+)\)\//.exec(file);
      if (!match) continue;
      for (const id of match[1].split(",")) {
        expect({ file, id, known: tabIds.has(id) }).toEqual({ file, id, known: true });
      }
    }
  });

  it("keeps only the root-stack allowlist outside (tabs)", () => {
    const outside = files.filter((f) => !f.startsWith("(tabs)/"));
    expect(new Set(outside)).toEqual(
      new Set(["_layout.tsx", "index.tsx", "+native-intent.ts", "dashboard-edit/[id].tsx"]),
    );
    const directlyUnderTabs = files.filter((f) => /^\(tabs\)\/[^/]+$/.test(f));
    expect(directlyUnderTabs).toEqual(["(tabs)/_layout.tsx", "(tabs)/index.tsx"]);
  });
});
