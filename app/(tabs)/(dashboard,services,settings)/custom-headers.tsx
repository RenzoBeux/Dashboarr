import { useCallback, useRef, useState } from "react";
import { Text } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HeaderListEditor } from "@/components/ui/header-list-editor";
import { toast } from "@/components/ui/toast";
import { useConfigStore } from "@/store/config-store";

const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

export default function CustomHeadersScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const stored = useConfigStore((s) => s.globalCustomHeaders);
  const setGlobalCustomHeaders = useConfigStore((s) => s.setGlobalCustomHeaders);

  const [headers, setHeaders] = useState<Record<string, string>>(stored);

  const isDirty = JSON.stringify(headers) !== JSON.stringify(stored);

  // --- Discard / navigation guard (mirrors overseerr/customize-discover.tsx) ---
  // Edits live only in local state until Save. This screen sits in a tab
  // stack (#330), so besides the header back and the Android hardware back,
  // re-tapping the active tab pops the stack to its root; usePreventRemove
  // intercepts all three and asks before the edits are lost.
  const allowRemoveRef = useRef(false);
  // The prevented navigation action rides as the step payload; null means the
  // header back (plain router.back()).
  const flow = useModalFlow<{
    discard: Parameters<typeof navigation.dispatch>[0] | null;
  }>();

  usePreventRemove(
    isDirty,
    useCallback(
      ({ data }) => {
        if (allowRemoveRef.current) {
          allowRemoveRef.current = false;
          navigation.dispatch(data.action);
          return;
        }
        Haptics.selectionAsync();
        flow.open("discard", data.action);
      },
      [navigation, flow],
    ),
  );

  function performDiscard() {
    const action = flow.payload("discard");
    allowRemoveRef.current = true;
    if (action) navigation.dispatch(action);
    else router.back();
  }

  function confirmDiscard() {
    flow.close();
    flow.whenClear(performDiscard);
  }

  function handleBack() {
    if (isDirty) {
      Haptics.selectionAsync();
      flow.open("discard", null);
      return;
    }
    allowRemoveRef.current = true;
    router.back();
  }

  const handleSave = () => {
    for (const [name, val] of Object.entries(headers)) {
      if (!HEADER_NAME_RE.test(name)) {
        toast(`Invalid header name: "${name}"`, "error");
        return;
      }
      if (/[\r\n]/.test(val)) {
        toast(`Header "${name}" value contains newlines`, "error");
        return;
      }
    }
    setGlobalCustomHeaders(headers);
    toast("Global headers saved", "success");
  };

  return (
    <ScreenWrapper>
      <BackHeader title="Custom Headers" onBack={handleBack} />

      <Text className="text-zinc-400 text-sm mb-4">
        These headers are sent on every outgoing request to every enabled
        service. Useful for reverse proxies that require their own auth
        (Cloudflare Access, Authelia, etc.).
      </Text>

      <Card className="gap-4 mb-4">
        <HeaderListEditor
          value={headers}
          onChange={setHeaders}
          helperText="Per-service headers (set in each service's settings) override these on collision. The service's own auth (API Key, Plex Token, etc.) always wins."
        />
      </Card>

      <Button
        label={isDirty ? "Save" : "Saved"}
        onPress={handleSave}
        disabled={!isDirty}
      />

      <ConfirmModal
        {...flow.bind("discard")}
        title="Discard changes?"
        message="Your header edits haven't been saved yet."
        tone="danger"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={confirmDiscard}
      />
    </ScreenWrapper>
  );
}
