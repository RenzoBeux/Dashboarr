import type {
  NavigationAction,
  ParamListBase,
  Router,
  StackNavigationState,
} from "@react-navigation/native";

type StackState = StackNavigationState<ParamListBase>;
type StackRouter = Router<StackState, NavigationAction>;
export type StackRouterOverride = (original: StackRouter) => Partial<StackRouter>;

/**
 * "Navigate to this stack's root" must mean "pop back to it", never "push a
 * second copy".
 *
 * expo-router resolves a tab-root href such as /(tabs)/tv into a nested
 * `{ screen: "tv" }` param on the tab; react-navigation turns that into a
 * NAVIGATE on the tab's stack without `pop`, and the stack router only reuses
 * an existing route when it is the current one or `pop` is set. With the tab
 * at [tv, series/1] the result would be [tv, series/1, tv], growing on every
 * "view all" tap. The root stack has the same hazard: a notification that
 * navigates to (tabs) while dashboard-edit is on top would push a second tab
 * navigator instead of popping the editor.
 */
export function rewriteRootNavigation(
  state: StackState,
  action: NavigationAction,
  rootNames: ReadonlySet<string>,
): NavigationAction {
  if (action.type !== "NAVIGATE" && action.type !== "PUSH") return action;
  const payload = action.payload as { name?: unknown; pop?: unknown } | undefined;
  const name = payload?.name;
  if (typeof name !== "string" || !rootNames.has(name) || payload?.pop) {
    return action;
  }
  // Anchor-less edge (a stack initialised straight on a nested screen): there
  // is no root to pop back to, so let the navigator push it.
  if (!state.routes.some((route) => route.name === name)) return action;
  return { ...action, type: "NAVIGATE", payload: { ...payload, pop: true } };
}

/** Composes the pop-to-root rule over another router override (expo's own). */
export function withPopToRootRule(
  rootNames: ReadonlySet<string>,
  base: StackRouterOverride,
): StackRouterOverride {
  return (original) => {
    const composed: StackRouter = { ...original, ...base(original) };
    return {
      ...composed,
      getStateForAction: (state, action, options) =>
        composed.getStateForAction(
          state,
          rewriteRootNavigation(state, action, rootNames),
          options,
        ),
    };
  };
}
