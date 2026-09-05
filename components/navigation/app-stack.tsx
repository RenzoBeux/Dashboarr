import { useMemo, type ComponentProps } from "react";
import { withLayoutContext } from "expo-router";
import type { ParamListBase, StackNavigationState } from "@react-navigation/native";
import type {
  NativeStackNavigationEventMap,
  NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
// Deep imports, pinned to expo-router ~6.0.23 (no `exports` map, so they
// resolve under Metro and Jest alike). They are exactly what expo's own
// <Stack> is built from; re-check both paths when upgrading expo-router.
import { createNativeStackNavigator } from "expo-router/build/fork/native-stack/createNativeStackNavigator";
import { stackRouterOverride } from "expo-router/build/layouts/StackClient";
import {
  withPopToRootRule,
  type StackRouterOverride,
} from "@/lib/stack-router-rules";

const { Navigator } = createNativeStackNavigator();

const LayoutStack = withLayoutContext<
  NativeStackNavigationOptions,
  typeof Navigator,
  StackNavigationState<ParamListBase>,
  NativeStackNavigationEventMap
>(Navigator);

type LayoutStackProps = ComponentProps<typeof LayoutStack>;

type AppStackProps = Omit<LayoutStackProps, "UNSTABLE_router"> & {
  /**
   * Route names that are roots of this stack. Navigating to one of them while
   * it is already in the stack pops back to it instead of pushing a duplicate
   * (lib/stack-router-rules.ts). Pass a module-level constant: the navigator
   * reads its router once.
   */
  popToRootNames: ReadonlySet<string>;
};

/**
 * expo-router's <Stack> plus the pop-to-root rule. <Stack> hardcodes
 * `UNSTABLE_router={stackRouterOverride}` after spreading its props, so the
 * rule has to be composed here, on the same forked navigator <Stack> uses.
 * Everything else is inherited: tab re-tap pops to top, router.back(), the
 * modal flows in hooks/use-modal-flow.ts.
 */
export function AppStack({ popToRootNames, ...props }: AppStackProps) {
  const router = useMemo(
    () =>
      withPopToRootRule(
        popToRootNames,
        stackRouterOverride as unknown as StackRouterOverride,
      ) as unknown as LayoutStackProps["UNSTABLE_router"],
    [popToRootNames],
  );
  return <LayoutStack {...props} UNSTABLE_router={router} />;
}

AppStack.Screen = LayoutStack.Screen;
