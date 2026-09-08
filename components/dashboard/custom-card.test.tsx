// Same native-storage shims every store-adjacent test in this repo uses —
// lib/haptics (pulled in by Button/Card) imports store/config-store at module
// load, which pulls in AsyncStorage/SecureStore.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => {}),
    multiRemove: jest.fn(async () => {}),
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockInstance: ServiceInstance = {
  id: "inst-1",
  name: "My API",
  enabled: true,
  localUrl: "http://10.0.0.5:1234",
  remoteUrl: "",
  useRemote: false,
  ignoreCertErrors: false,
  custom: {
    actions: [
      { id: "restart", label: "Restart", method: "POST" as const, path: "/restart" },
      {
        id: "wipe",
        label: "Wipe",
        method: "POST" as const,
        path: "/wipe",
        confirm: true,
      },
    ],
  },
};

const emptyInstance: ServiceInstance = {
  ...mockInstance,
  id: "inst-empty",
  name: "My API",
  custom: {},
};

// Card-level dependencies are mocked directly rather than driving the real
// zustand config store + workspace/dashboard machinery through it — the card
// only needs to be handed a settled instance list and a mocked API surface;
// exercising the full store is B1/B2's + the store's own test suites' job.
jest.mock("@/hooks/use-widget-settings", () => ({
  useWidgetSettings: () => ({
    settings: { instanceIds: "all", hideWhenEmpty: false },
    update: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock("@/hooks/use-hide-when-empty", () => ({
  useHideWhenEmpty: () => {},
}));

const mockUseWorkspaceScopedInstances = jest.fn(
  (..._args: unknown[]) => [mockInstance],
);
jest.mock("@/hooks/use-workspace-instances", () => ({
  useWorkspaceScopedInstances: (...args: unknown[]) =>
    mockUseWorkspaceScopedInstances(...args),
}));

const mockGetStats = jest.fn();
const mockRunAction = jest.fn();
jest.mock("@/services/custom-api", () => ({
  getStats: (...args: unknown[]) => mockGetStats(...args),
  runAction: (...args: unknown[]) => mockRunAction(...args),
}));

import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { Text, Modal } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CustomCard } from "./custom-card";
import type { ServiceInstance } from "@/store/config-store";

function allText(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => {
      const c = t.props.children;
      if (Array.isArray(c)) {
        return c.map((x) => (x == null ? "" : String(x))).join("");
      }
      return c == null ? "" : String(c);
    })
    .join(" | ");
}

async function renderCard(): Promise<{
  renderer: ReactTestRenderer;
  queryClient: QueryClient;
}> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <CustomCard slotId="slot-1" />
      </QueryClientProvider>,
    );
  });
  // Flush the getStats microtask (and the notifyManager batch it schedules)
  // within act() so the update lands before the test asserts, and so no timer
  // is left dangling past teardown (see lib/multi-instance-query usage above).
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { renderer, queryClient };
}

function cleanup(renderer: ReactTestRenderer, queryClient: QueryClient) {
  act(() => {
    renderer.unmount();
  });
  queryClient.clear();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseWorkspaceScopedInstances.mockReturnValue([mockInstance]);
});

describe("CustomCard", () => {
  it("renders stat tiles from a mocked getStats", async () => {
    mockGetStats.mockResolvedValue([
      { label: "Peers", raw: 42, display: "42", unit: undefined },
    ]);

    const { renderer, queryClient } = await renderCard();
    try {
      expect(mockGetStats).toHaveBeenCalledWith("inst-1");
      const text = allText(renderer);
      expect(text).toContain("Peers");
      expect(text).toContain("42");
    } finally {
      cleanup(renderer, queryClient);
    }
  });

  it("pressing a plain action button calls the mocked runAction", async () => {
    mockGetStats.mockResolvedValue([]);
    mockRunAction.mockResolvedValue({ status: 200, body: {} });

    const { renderer, queryClient } = await renderCard();
    try {
      const restartButton = renderer.root
        .findAllByType(Button)
        .find((b) => b.props.label === "Restart");
      expect(restartButton).toBeTruthy();

      await act(async () => {
        restartButton!.props.onPress();
        await Promise.resolve();
      });

      expect(mockRunAction).toHaveBeenCalledWith("inst-1", "restart");
    } finally {
      cleanup(renderer, queryClient);
    }
  });

  it("shows the confirm dialog before calling runAction for a confirm action", async () => {
    mockGetStats.mockResolvedValue([]);
    mockRunAction.mockResolvedValue({ status: 200, body: {} });

    const { renderer, queryClient } = await renderCard();
    try {
      // The confirm modal is not visible before the action is pressed.
      const modalBefore = renderer.root.findAllByType(Modal)[0];
      expect(modalBefore.props.visible).toBe(false);

      const wipeButton = renderer.root
        .findAllByType(Button)
        .find((b) => b.props.label === "Wipe");
      expect(wipeButton).toBeTruthy();

      act(() => {
        wipeButton!.props.onPress();
      });

      // Pressing a `confirm: true` action must NOT call runAction directly —
      // the dialog has to be confirmed first.
      expect(mockRunAction).not.toHaveBeenCalled();
      const modalAfter = renderer.root.findAllByType(Modal)[0];
      expect(modalAfter.props.visible).toBe(true);

      const confirmButton = renderer.root
        .findAllByType(Button)
        .find((b) => b.props.label === "Run");
      expect(confirmButton).toBeTruthy();

      await act(async () => {
        confirmButton!.props.onPress();
        await Promise.resolve();
      });

      expect(mockRunAction).toHaveBeenCalledWith("inst-1", "wipe");
    } finally {
      cleanup(renderer, queryClient);
    }
  });

  it("renders nothing broken for an instance with zero stats and zero actions", async () => {
    mockUseWorkspaceScopedInstances.mockReturnValue([emptyInstance]);
    mockGetStats.mockResolvedValue([]);

    const { renderer, queryClient } = await renderCard();
    try {
      const text = allText(renderer);
      expect(text).toContain("My API");
      expect(text).toContain("No stats or actions configured");
      expect(renderer.root.findAllByType(Button)).toHaveLength(0);
    } finally {
      cleanup(renderer, queryClient);
    }
  });
});
