// Same native-storage shims every store-adjacent test in this repo uses —
// lib/haptics (pulled in by Button/Toggle/Card) and components/ui/toast pull
// in store/config-store at module load, which pulls in AsyncStorage/
// SecureStore.
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
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => {}),
}));

// components/ui/select.tsx pulls in components/ui/glass-surface.tsx ->
// @callstack/liquid-glass, an ESM-only package outside jest.config.js's
// transformIgnorePatterns allowlist — nothing in this repo has exercised that
// import chain under Jest before (there were no .test.tsx files at all prior
// to this item), so it has never been transformed. A lightweight stand-in
// mirrors Select's public props (label/value/options/onChange) without
// pulling in its bottom-sheet + GlassSurface implementation, which this
// editor's own logic doesn't touch — CustomServiceEditor only reads
// value/onChange through the same interface.
jest.mock("@/components/ui/select", () => {
  const ReactActual = jest.requireActual("react");
  const { View: RNView, Text: RNText, Pressable: RNPressable } =
    jest.requireActual("react-native");
  return {
    Select: ({ label, value, options, onChange }: any) =>
      ReactActual.createElement(
        RNView,
        null,
        ReactActual.createElement(RNText, null, label),
        options.map((o: any) =>
          ReactActual.createElement(
            RNPressable,
            {
              key: String(o.value),
              testID: `select-${label}-${o.value}`,
              onPress: () => onChange(o.value),
            },
            ReactActual.createElement(
              RNText,
              null,
              o.value === value ? `${o.label} (selected)` : o.label,
            ),
          ),
        ),
      ),
  };
});

import { useState } from "react";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { View } from "react-native";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { CustomServiceEditor } from "@/components/integrations/custom-editor";
import type { CustomServiceDefinition } from "@/lib/custom-service";

// Controlled-component test harness: CustomServiceEditor takes value/onChange
// like every field in ServiceEditor, so exercising it means owning the state
// the way ServiceEditor would.
function Harness({
  onValueChange,
}: {
  onValueChange: (v: CustomServiceDefinition) => void;
}) {
  const [value, setValue] = useState<CustomServiceDefinition>({});
  return (
    <CustomServiceEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

function render(onValueChange: (v: CustomServiceDefinition) => void) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Harness onValueChange={onValueChange} />);
  });
  return renderer;
}

function findImportInput(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({ testID: "custom-import-input" });
}

function findImportButton(renderer: ReactTestRenderer) {
  const btn = renderer.root
    .findAllByType(Button)
    .find((b) => b.props.label === "Import JSON");
  if (!btn) throw new Error("Import JSON button not found");
  return btn;
}

function importErrorNodes(renderer: ReactTestRenderer) {
  return renderer.root.findAllByProps({ testID: "custom-import-error" });
}

function allInputValues(renderer: ReactTestRenderer): unknown[] {
  return renderer.root.findAllByType(TextInput).map((t) => t.props.value);
}

describe("CustomServiceEditor — Import JSON", () => {
  it("rejects malformed JSON and shows an error, without applying it", () => {
    const onValueChange = jest.fn();
    const renderer = render(onValueChange);

    act(() => {
      findImportInput(renderer).props.onChangeText("{ not valid json");
    });
    act(() => {
      findImportButton(renderer).props.onPress();
    });

    expect(importErrorNodes(renderer).length).toBeGreaterThan(0);
    expect(onValueChange).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });
  });

  it("rejects structurally invalid definitions (fails validateCustomServiceDefinition) and shows the errors", () => {
    const onValueChange = jest.fn();
    const renderer = render(onValueChange);

    act(() => {
      findImportInput(renderer).props.onChangeText(
        JSON.stringify({ auth: { mode: "not-a-real-mode" } }),
      );
    });
    act(() => {
      findImportButton(renderer).props.onPress();
    });

    const errorNodes = importErrorNodes(renderer);
    expect(errorNodes.length).toBeGreaterThan(0);
    expect(onValueChange).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });
  });

  it("accepts a valid definition and fills the editor's fields", () => {
    const onValueChange = jest.fn();
    const renderer = render(onValueChange);

    const validDef = {
      auth: { mode: "bearer", token: "s3cr3t-token" },
      health: { method: "GET", path: "/status", versionPath: "version" },
      stats: [{ label: "Peers", path: "data.peers", format: "number" }],
      actions: [
        { id: "restart", label: "Restart", method: "POST", path: "/restart" },
      ],
    };

    act(() => {
      findImportInput(renderer).props.onChangeText(JSON.stringify(validDef));
    });
    act(() => {
      findImportButton(renderer).props.onPress();
    });

    // No error, and onChange was called with the validated (structurally
    // identical) definition.
    expect(importErrorNodes(renderer).length).toBe(0);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(validDef);

    // The controlled fields now reflect the imported values.
    const values = allInputValues(renderer);
    expect(values).toContain("s3cr3t-token"); // auth.token
    expect(values).toContain("/status"); // health.path
    expect(values).toContain("version"); // health.versionPath
    expect(values).toContain("Peers"); // stats[0].label
    expect(values).toContain("data.peers"); // stats[0].path
    expect(values).toContain("Restart"); // actions[0].label
    expect(values).toContain("restart"); // actions[0].id
    expect(values).toContain("/restart"); // actions[0].path

    act(() => {
      renderer.unmount();
    });
  });

  it("clears a previous import error once the pasted text is edited", () => {
    const onValueChange = jest.fn();
    const renderer = render(onValueChange);

    act(() => {
      findImportInput(renderer).props.onChangeText("not json at all");
    });
    act(() => {
      findImportButton(renderer).props.onPress();
    });
    expect(importErrorNodes(renderer).length).toBeGreaterThan(0);

    act(() => {
      findImportInput(renderer).props.onChangeText("still typing");
    });
    expect(importErrorNodes(renderer).length).toBe(0);

    act(() => {
      renderer.unmount();
    });
  });
});

describe("CustomServiceEditor — username/password visibility", () => {
  // Sibling-item review requirement: show username/password whenever a login
  // step is present OR auth mode is basic — a login step's body can reference
  // {{username}}/{{password}} while the primary auth mode stays "none" (the
  // qBittorrent-shaped preset).
  it("shows username/password once a login step is present, even with auth mode none", () => {
    const onValueChange = jest.fn();
    const renderer = render(onValueChange);

    // auth.mode defaults to "none" — no username/password fields yet.
    expect(
      renderer.root.findAllByType(TextInput).some((t) => t.props.label === "Username"),
    ).toBe(false);

    act(() => {
      findImportInput(renderer).props.onChangeText(
        JSON.stringify({
          auth: { mode: "none" },
          login: {
            method: "POST",
            path: "/api/v2/auth/login",
            body: "username={{username}}&password={{password}}",
            injectAs: "cookie",
          },
        }),
      );
    });
    act(() => {
      findImportButton(renderer).props.onPress();
    });

    expect(
      renderer.root.findAllByType(TextInput).some((t) => t.props.label === "Username"),
    ).toBe(true);
    expect(
      renderer.root.findAllByType(TextInput).some((t) => t.props.label === "Password"),
    ).toBe(true);

    act(() => {
      renderer.unmount();
    });
  });
});

describe("CustomServiceEditor — secret fields", () => {
  it("renders the token and password inputs as secureTextEntry", () => {
    const onValueChange = jest.fn();
    const renderer = render(onValueChange);

    act(() => {
      findImportInput(renderer).props.onChangeText(
        JSON.stringify({ auth: { mode: "bearer", token: "abc" } }),
      );
    });
    act(() => {
      findImportButton(renderer).props.onPress();
    });

    const tokenInput = renderer.root
      .findAllByType(TextInput)
      .find((t) => t.props.label === "Token");
    expect(tokenInput).toBeTruthy();
    expect(tokenInput!.props.secureTextEntry).toBe(true);

    act(() => {
      renderer.unmount();
    });
  });
});

// Confirms an empty View doesn't blow up (View is imported so the file only
// needs one RN import for the small sanity assertion below).
describe("CustomServiceEditor — max caps", () => {
  it("disables Add stat once 8 stats are present", () => {
    const onValueChange = jest.fn();
    const renderer = render(onValueChange);

    const stats = Array.from({ length: 8 }, (_, i) => ({
      label: `Stat ${i}`,
      path: `data.stat${i}`,
    }));
    act(() => {
      findImportInput(renderer).props.onChangeText(JSON.stringify({ stats }));
    });
    act(() => {
      findImportButton(renderer).props.onPress();
    });

    const addStatButton = renderer.root.findByProps({ testID: "custom-add-stat" });
    expect(addStatButton.props.disabled).toBe(true);

    expect(renderer.root.findAllByType(View).length).toBeGreaterThan(0);

    act(() => {
      renderer.unmount();
    });
  });
});
