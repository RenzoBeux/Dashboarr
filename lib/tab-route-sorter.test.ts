import { INTERNAL_SLOT_NAME } from "expo-router/build/constants";
import type { RouteConfig } from "expo-router/build/fork/getStateFromPath";
import { getStateFromPath } from "expo-router/build/fork/getStateFromPath";
import * as forks from "expo-router/build/fork/getStateFromPath-forks";
import { getReactNavigationConfig } from "expo-router/build/getReactNavigationConfig";
import { getRoutes } from "expo-router/build/getRoutesCore";
import { inMemoryContext } from "expo-router/build/testing-library/context-stubs";
import { ALL_TAB_ROUTE_IDS } from "@/lib/tab-routes";
import { SHARED_TAB_LAYOUT, listAppRouteFiles } from "@/lib/testing/app-route-files";

// Guards the expo-router patch in patches/expo-router@6.0.23.patch (#426).
//
// getStateFromPath ranks every candidate route with one comparator
// (getRouteConfigSorter) and takes the first match. Upstream, that comparator
// is cyclic: a static route outranks a dynamic one, the dynamic one outranks
// its own static prefix via the pattern-prefix rule, and that prefix outranks
// the first static one on the isInitial tie-break. Array.prototype.sort with a
// non-transitive comparator yields an order that depends on the input array's
// length and layout, not just on its elements, so adding one tab to the shared
// array group silently re-resolved unrelated screens into the wrong tab stack
// (/movie/history/1 opened from the TV tab landed in the Books stack). The
// patch demotes the prefix rule below the specificity rules.
//
// lib/tab-route-resolution.test.ts asserts the resolutions themselves. This
// file asserts the property that keeps them stable as tabs are added: over our
// real route tree, the comparator is a total order.

const baseKeys = listAppRouteFiles()
  .filter((f) => /\.tsx?$/.test(f) && !f.startsWith("+"))
  .map((f) => f.replace(/\.tsx?$/, ""));

// The one array group that carries the shared tab layout, and so the only one
// that lists every tab id (lib/tab-routes.ts, "Tab groups (#330)"). That is the
// group a new tab joins; the narrower groups like (dashboard,services,settings)
// list a hand-picked subset and a new tab does not join them. Its directory
// holds nothing but the layout, so renaming this one key renames the group.
const sharedLayoutKeys = baseKeys.filter((key) => SHARED_TAB_LAYOUT.test(`${key}.tsx`));
if (sharedLayoutKeys.length !== 1) {
  throw new Error(`expected exactly one shared tab layout, found ${sharedLayoutKeys.length}`);
}
const [SHARED_LAYOUT_KEY] = sharedLayoutKeys;
const SHARED_GROUP = SHARED_TAB_LAYOUT.exec(`${SHARED_LAYOUT_KEY}.tsx`)![1];

type AnyRoute = { name: string; state?: AnyState };
type AnyState = { index?: number; routes: AnyRoute[] };

/**
 * The real route tree, optionally with one synthetic extra tab appended to the
 * shared group (a stand-in for the next integration's tab).
 */
function buildConfig(extraTab?: string) {
  let keys = baseKeys;
  const ids = [...ALL_TAB_ROUTE_IDS] as string[];
  if (extraTab) {
    // New service tabs go in just before `settings`, the position that broke.
    const ordered = SHARED_GROUP.split(",");
    ordered.splice(ordered.length - 1, 0, extraTab);
    const renamed = SHARED_LAYOUT_KEY.replace(`(${SHARED_GROUP})`, `(${ordered.join(",")})`);
    keys = keys.map((key) => (key === SHARED_LAYOUT_KEY ? renamed : key));
    keys = [...keys, `(tabs)/(${extraTab})/${extraTab}`, `(tabs)/(${extraTab})/${extraTab}/[id]`];
    ids.splice(ids.length - 1, 0, extraTab);
  }
  const anchors = Object.fromEntries(ids.map((id) => [id, { anchor: id }]));
  const modules = Object.fromEntries(
    keys.map((key) => [
      key,
      SHARED_TAB_LAYOUT.test(`${key}.tsx`)
        ? { default: () => null, unstable_settings: anchors }
        : { default: () => null },
    ]),
  );
  const routeNode = getRoutes(inMemoryContext(modules), {
    skipGenerated: true,
    ignoreEntryPoints: true,
    platform: "ios",
    preserveRedirectAndRewrites: true,
    getSystemRoute: () => {
      throw new Error("system routes are skipped in this test");
    },
  });
  if (!routeNode) throw new Error("expo-router produced no route tree for app/");
  const navConfig = getReactNavigationConfig(routeNode, true);
  return { keys, config: { screens: { [INTERNAL_SLOT_NAME]: { path: "", ...navConfig } } } };
}

/**
 * Resolve one href and hand back every route config the sorter ranked while
 * doing it, plus the comparator it used. The comparator is the unit under
 * test, and expo-router only builds its config list internally, so we wrap the
 * factory rather than reimplement the list.
 */
function rankedConfigs(config: object, href: string, segments: string[]) {
  const original = forks.getRouteConfigSorter;
  const seen = new Set<RouteConfig>();
  let compare: ((a: RouteConfig, b: RouteConfig) => number) | undefined;
  (forks as { getRouteConfigSorter: typeof original }).getRouteConfigSorter = (previousSegments) => {
    const inner = original(previousSegments);
    compare = (a, b) => {
      seen.add(a);
      seen.add(b);
      return inner(a, b);
    };
    return compare;
  };
  try {
    getStateFromPath(href, config as never, segments);
  } finally {
    (forks as { getRouteConfigSorter: typeof original }).getRouteConfigSorter = original;
  }
  if (!compare || seen.size === 0) throw new Error(`sorter never ran for ${href}`);
  return { configs: [...seen], compare };
}

const at = (group: string, ...rest: string[]) => ["(tabs)", `(${group})`, ...rest];

// Both an unqualified deep link (no tab context, so the similarity tie-break
// sits idle) and an in-app push (context present, so it participates).
const CASES: [string, string, string[]][] = [
  ["a cold deep link", "/manual-import", []],
  ["an in-app push", "/settings/integrations/1/1", at("settings", "settings")],
];

describe("expo-router route config sorter", () => {
  const { config } = buildConfig();

  describe.each(CASES)("ranking %s", (_name, href, segments) => {
    const { configs, compare } = rankedConfigs(config, href, segments);

    it("is antisymmetric", () => {
      const violations: string[] = [];
      for (let i = 0; i < configs.length; i++) {
        for (let j = i + 1; j < configs.length; j++) {
          const ab = Math.sign(compare(configs[i], configs[j]));
          const ba = Math.sign(compare(configs[j], configs[i]));
          if (ab !== -ba) violations.push(`${configs[i].pattern} vs ${configs[j].pattern}`);
        }
      }
      expect(violations).toEqual([]);
    });

    it("is transitive", () => {
      const cycles: string[] = [];
      for (const a of configs) {
        for (const b of configs) {
          if (a === b || compare(a, b) >= 0) continue;
          for (const c of configs) {
            if (b === c || a === c) continue;
            if (compare(b, c) < 0 && compare(a, c) > 0) {
              cycles.push(`${a.pattern} < ${b.pattern} < ${c.pattern} < ${a.pattern}`);
            }
          }
        }
      }
      expect(cycles.slice(0, 5)).toEqual([]);
    });

    it("sorts into an order with no inversions", () => {
      const sorted = [...configs].sort(compare);
      const inversions: string[] = [];
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          if (compare(sorted[i], sorted[j]) > 0) {
            inversions.push(`${j} ${sorted[j].pattern} ranks above ${i} ${sorted[i].pattern}`);
          }
        }
      }
      expect(inversions.slice(0, 5)).toEqual([]);
    });
  });

  // The end-to-end symptom: a cyclic comparator only misbehaves once the
  // config array changes shape, so pin the invariant against a tree with one
  // more tab in it than we ship today.
  it("keeps every shared screen in its own tab after a new tab is added", () => {
    const next = buildConfig("newtab");
    const misrouted: string[] = [];
    for (const key of next.keys) {
      const match = /^\(tabs\)\/\(([^/]+)\)\/(.+)$/.exec(key);
      if (!match || match[2] === "_layout") continue;
      const href = `/${match[2].replace(/\/index$/, "").replace(/\[[^\]]+\]/g, "1")}`;
      for (const id of match[1].split(",")) {
        const state = getStateFromPath(href, next.config as never, at(id, id)) as AnyState | undefined;
        const chain: string[] = [];
        let level: AnyState | undefined = state;
        while (level) {
          const route: AnyRoute = level.routes[level.index ?? level.routes.length - 1];
          chain.push(route.name);
          level = route.state;
        }
        const group = chain[1] === "(tabs)" ? chain[2] : `(root)/${chain[1]}`;
        if (group !== `(${id})`) misrouted.push(`${href} from (${id}) resolved into ${group}`);
      }
    }
    expect(misrouted).toEqual([]);
  });
});
