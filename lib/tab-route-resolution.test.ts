import { findFocusedRoute } from "@react-navigation/native";
import { INTERNAL_SLOT_NAME } from "expo-router/build/constants";
import { getStateFromPath } from "expo-router/build/fork/getStateFromPath";
import { getReactNavigationConfig } from "expo-router/build/getReactNavigationConfig";
import { getRoutes } from "expo-router/build/getRoutesCore";
import { inMemoryContext } from "expo-router/build/testing-library/context-stubs";
import { ALL_TAB_ROUTE_IDS, TAB_STACK_ANCHORS } from "@/lib/tab-routes";
import { SHARED_TAB_LAYOUT, listAppRouteFiles } from "@/lib/testing/app-route-files";
import { redirectSystemPath } from "../app/+native-intent";

// Runs expo-router's real route-tree builder and href resolver over the
// actual app/ file tree (#330). Every screen module is a stub; only the shared
// tab layout's `unstable_settings` is real, because that is what anchors each
// tab's stack on its root. Mirrors the runtime: the same getRoutes options as
// router-store, the config wrapped in the `__root` slot, and the current
// segments passed to getStateFromPath so an unqualified href resolves into the
// current tab's group rather than the first group in the tree.

const routeKeys = listAppRouteFiles()
  .filter((f) => /\.tsx?$/.test(f) && !f.startsWith("+"))
  .map((f) => f.replace(/\.tsx?$/, ""));

const modules = Object.fromEntries(
  routeKeys.map((key) => [
    key,
    SHARED_TAB_LAYOUT.test(`${key}.tsx`)
      ? { default: () => null, unstable_settings: TAB_STACK_ANCHORS }
      : { default: () => null },
  ]),
);

const routeNode = getRoutes(inMemoryContext(modules), {
  skipGenerated: true,
  ignoreEntryPoints: true,
  platform: "ios",
  preserveRedirectAndRewrites: true,
  // Only consulted for generated system routes (sitemap, not-found), which
  // skipGenerated turns off.
  getSystemRoute: () => {
    throw new Error("system routes are skipped in this test");
  },
});
if (!routeNode) throw new Error("expo-router produced no route tree for app/");
const navConfig = getReactNavigationConfig(routeNode, true);
const config = { screens: { [INTERNAL_SLOT_NAME]: { path: "", ...navConfig } } };

type AnyRoute = { name: string; params?: object; state?: AnyState };
type AnyState = { index?: number; routes: AnyRoute[] };

function resolve(href: string, segments: string[] = []) {
  const state = getStateFromPath(href, config as never, segments) as AnyState | undefined;
  if (!state) throw new Error(`unresolved href ${href} from [${segments.join(", ")}]`);
  // Focused route at each navigator level, e.g. ["__root", "(tabs)", "(tv)", "series/[id]"],
  // and the state of each level: [0] root slot, [1] root stack, [2] tabs, [3] the tab's stack.
  const chain: string[] = [];
  const levels: AnyState[] = [];
  let level: AnyState | undefined = state;
  while (level) {
    levels.push(level);
    const route: AnyRoute = level.routes[level.index ?? level.routes.length - 1];
    chain.push(route.name);
    level = route.state;
  }
  return {
    chain,
    group: chain[1] === "(tabs)" ? chain[2] : undefined,
    groupStack: levels[3]?.routes.map((r) => r.name),
    leaf: findFocusedRoute(state as never)!,
  };
}

const at = (group: string, ...rest: string[]) => ["(tabs)", `(${group})`, ...rest];

describe("tab route resolution", () => {
  it("anchors every tab group's stack on its root screen", () => {
    const tabs = navConfig.screens["(tabs)"] as { screens: Record<string, { initialRouteName?: string }> };
    for (const id of ALL_TAB_ROUTE_IDS) {
      expect({ id, anchor: tabs.screens[`(${id})`]?.initialRouteName }).toEqual({ id, anchor: id });
    }
  });

  it("resolves every tab root at its unchanged URL", () => {
    for (const id of ALL_TAB_ROUTE_IDS) {
      expect(resolve(`/${id}`).chain).toEqual([INTERNAL_SLOT_NAME, "(tabs)", `(${id})`, id]);
    }
  });

  it.each([
    [at("tv", "tv"), "/series/1", "(tv)", "series/[id]"],
    [at("tv", "series", "[id]"), "/series/releases/1", "(tv)", "series/releases/[id]"],
    [at("dashboard", "search"), "/movie/1", "(dashboard)", "movie/[id]"],
    [at("dashboard", "dashboard"), "/search", "(dashboard)", "search"],
    [at("dashboard", "dashboard"), "/sab/SABnzbd_nzo_x", "(dashboard)", "sab/[nzo_id]"],
    [at("dashboard", "dashboard"), "/home-networks", "(dashboard)", "home-networks"],
    [at("library", "library"), "/series/search", "(library)", "series/search"],
    [at("calendar", "calendar"), "/movie/7", "(calendar)", "movie/[id]"],
    [at("music", "music"), "/artist/3", "(music)", "artist/[id]"],
    [at("books", "books"), "/book/3", "(books)", "book/[id]"],
    [at("downloads", "downloads"), "/torrent/abc", "(downloads)", "torrent/[hash]"],
    [at("services", "services"), "/settings/integrations", "(services)", "settings/integrations/index"],
    [at("settings", "settings", "network"), "/wake-on-lan", "(settings)", "wake-on-lan"],
    [at("activity", "activity"), "/tautulli-stats", "(activity)", "tautulli-stats"],
    [at("pihole", "pihole"), "/pihole/queries", "(pihole)", "pihole/queries"],
    [at("navidrome", "navidrome"), "/navidrome/playlist/9", "(navidrome)", "navidrome/playlist/[id]"],
    [at("requests", "requests"), "/overseerr/discover-list", "(requests)", "overseerr/discover-list"],
  ])("from %j, %s stays in %s", (segments, href, group, leaf) => {
    const result = resolve(href, segments);
    expect(result.group).toBe(group);
    expect(result.leaf.name).toBe(leaf);
  });

  it("resolves every shared screen inside each tab that lists it", () => {
    for (const key of routeKeys) {
      const match = /^\(tabs\)\/\(([^/]+)\)\/(.+)$/.exec(key);
      if (!match || match[2] === "_layout") continue;
      const href = `/${match[2].replace(/\/index$/, "").replace(/\[[^\]]+\]/g, "1")}`;
      for (const id of match[1].split(",")) {
        expect({ href, from: id, group: resolve(href, at(id, id)).group }).toEqual({
          href,
          from: id,
          group: `(${id})`,
        });
      }
    }
  });

  it("resolves tab-root hrefs from other tabs, with and without the group", () => {
    expect(resolve("/(tabs)/dashboard", at("settings", "settings")).chain).toEqual([
      INTERNAL_SLOT_NAME, "(tabs)", "(dashboard)", "dashboard",
    ]);
    const downloads = resolve("/downloads?client=deluge", at("dashboard", "dashboard"));
    expect(downloads.chain).toEqual([INTERNAL_SLOT_NAME, "(tabs)", "(downloads)", "downloads"]);
    expect(downloads.leaf.params).toEqual({ client: "deluge" });
    expect(resolve("/(tabs)/navidrome", at("dashboard", "search")).group).toBe("(navidrome)");
  });

  it("keeps the dashboard editor on the root stack", () => {
    expect(resolve("/dashboard-edit/x", at("plex", "plex")).chain).toEqual([
      INTERNAL_SLOT_NAME, "dashboard-edit/[id]",
    ]);
  });

  it("inserts the Dashboard root under a cold, qualified content deep link", () => {
    const result = resolve("/(tabs)/(dashboard)/series/1?instanceId=x");
    expect(result.group).toBe("(dashboard)");
    expect(result.groupStack).toEqual(["dashboard", "series/[id]"]);
    expect(result.leaf.params).toEqual({ id: "1", instanceId: "x" });
  });

  it("routes a widget deep link through +native-intent into the Dashboard stack", () => {
    const rewritten = redirectSystemPath({
      path: "dashboarr:///series/42?instanceId=s1",
      initial: true,
    });
    const result = resolve(rewritten);
    expect(result.chain).toEqual([INTERNAL_SLOT_NAME, "(tabs)", "(dashboard)", "series/[id]"]);
    expect(result.groupStack).toEqual(["dashboard", "series/[id]"]);
    expect(result.leaf.params).toEqual({ id: "42", instanceId: "s1" });
  });

  // A screen in a multi-tab array group is registered in every tab stack that
  // lists it, so an OS link (no tab context) resolves into whichever group the
  // route tree orders first. That order is incidental — adding or renaming a
  // tab silently changes it — so assert the invariant instead: after
  // +native-intent, every shared screen lands in the Dashboard stack with the
  // Dashboard root underneath. Some families get there via the rewrite, the
  // settings-ish ones already resolve that way; either is fine, drifting out
  // is not. The count guards against a screen silently leaving a group.
  it("lands every shared-group screen in the Dashboard stack with no tab context", () => {
    let checked = 0;
    for (const key of routeKeys) {
      const match = /^\(tabs\)\/\(([^/]*,[^/]*)\)\/(.+)$/.exec(key);
      if (!match || match[2] === "_layout") continue;
      const href = `/${match[2].replace(/\/index$/, "").replace(/\[[^\]]+\]/g, "1")}`;
      const result = resolve(redirectSystemPath({ path: href, initial: true }));
      expect({ href, group: result.group, under: result.groupStack?.[0] }).toEqual({
        href,
        group: "(dashboard)",
        under: "dashboard",
      });
      checked += 1;
    }
    expect(checked).toBe(32);
  });

  it("keeps a rewritten link in the Dashboard stack even from another tab", () => {
    const href = redirectSystemPath({ path: "dashboarr:///torrent/abc", initial: true });
    expect(resolve(href).group).toBe("(dashboard)");
    expect(resolve(href, at("tv", "tv")).group).toBe("(dashboard)");
  });
});
