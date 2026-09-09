import {
  CommonActions,
  StackActions,
  StackRouter,
  type NavigationAction,
  type ParamListBase,
  type StackNavigationState,
} from "@react-navigation/native";
import { rewriteRootNavigation, withPopToRootRule } from "@/lib/stack-router-rules";

const ROOTS: ReadonlySet<string> = new Set(["tv"]);

function stackState(names: string[]): StackNavigationState<ParamListBase> {
  return {
    type: "stack",
    key: "stack-1",
    stale: false,
    index: names.length - 1,
    routeNames: ["tv", "series/[id]", "series/releases/[id]"],
    routes: names.map((name, i) => ({ key: `${name}-${i}`, name })),
    preloadedRoutes: [],
  };
}

const navigateToRoot = CommonActions.navigate({ name: "tv", params: { client: "deluge" } });

describe("rewriteRootNavigation", () => {
  it("turns NAVIGATE to a root already in the stack into a pop", () => {
    const out = rewriteRootNavigation(stackState(["tv", "series/[id]"]), navigateToRoot, ROOTS);
    expect(out).toEqual({
      type: "NAVIGATE",
      payload: { name: "tv", params: { client: "deluge" }, pop: true },
    });
  });

  it("turns PUSH to a root already in the stack into NAVIGATE with pop", () => {
    const push: NavigationAction = { type: "PUSH", payload: { name: "tv" } };
    expect(rewriteRootNavigation(stackState(["tv", "series/[id]"]), push, ROOTS)).toEqual({
      type: "NAVIGATE",
      payload: { name: "tv", pop: true },
    });
  });

  it("leaves navigation to non-root screens alone", () => {
    const action: NavigationAction = {
      type: "NAVIGATE",
      payload: { name: "series/[id]", params: { id: "2" } },
    };
    expect(rewriteRootNavigation(stackState(["tv", "series/[id]"]), action, ROOTS)).toBe(action);
  });

  it("leaves a root that is not in the stack alone (anchor-less stack)", () => {
    expect(rewriteRootNavigation(stackState(["series/[id]"]), navigateToRoot, ROOTS)).toBe(
      navigateToRoot,
    );
  });

  it("leaves an explicit pop alone", () => {
    const action: NavigationAction = { type: "NAVIGATE", payload: { name: "tv", pop: true } };
    expect(rewriteRootNavigation(stackState(["tv", "series/[id]"]), action, ROOTS)).toBe(action);
  });

  it("leaves other action types alone", () => {
    for (const action of [
      { type: "GO_BACK" },
      { type: "POP_TO_TOP" },
      { type: "REPLACE", payload: { name: "tv" } },
      { type: "SET_PARAMS", payload: { params: { a: 1 } } },
    ] satisfies NavigationAction[]) {
      expect(rewriteRootNavigation(stackState(["tv", "series/[id]"]), action, ROOTS)).toBe(
        action,
      );
    }
  });
});

describe("withPopToRootRule over react-navigation's StackRouter", () => {
  const original = StackRouter({});
  const options = {
    routeNames: ["tv", "series/[id]", "series/releases/[id]"],
    routeParamList: {},
    routeGetIdList: {},
  };
  const withRule = { ...original, ...withPopToRootRule(ROOTS, () => ({}))(original) };

  it("documents the hazard: the plain router pushes a duplicate root", () => {
    const next = original.getStateForAction(
      stackState(["tv", "series/[id]"]),
      navigateToRoot,
      options,
    );
    expect(next?.routes.map((r) => r.name)).toEqual(["tv", "series/[id]", "tv"]);
  });

  it("pops back to the root and applies the new params", () => {
    const next = withRule.getStateForAction(
      stackState(["tv", "series/[id]", "series/releases/[id]"]),
      navigateToRoot,
      options,
    );
    expect(next?.routes.map((r) => r.name)).toEqual(["tv"]);
    expect(next?.index).toBe(0);
    expect(next?.routes[0]?.params).toEqual({ client: "deluge" });
  });

  it("still pushes nested screens normally", () => {
    const next = withRule.getStateForAction(
      stackState(["tv"]),
      StackActions.push("series/[id]", { id: "1" }),
      options,
    );
    expect(next?.routes.map((r) => r.name)).toEqual(["tv", "series/[id]"]);
  });

  it("keeps the base override's methods", () => {
    const marker = jest.fn();
    const composed = withPopToRootRule(ROOTS, () => ({
      getStateForAction: (state) => {
        marker();
        return state;
      },
    }))(original);
    composed.getStateForAction?.(stackState(["tv"]), navigateToRoot, options);
    expect(marker).toHaveBeenCalledTimes(1);
  });
});
