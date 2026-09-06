import { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HeaderListEditor } from "@/components/ui/header-list-editor";
import { toast } from "@/components/ui/toast";
import { useConfigStore } from "@/store/config-store";

const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

export default function CustomHeadersScreen() {
  const router = useRouter();
  const stored = useConfigStore((s) => s.globalCustomHeaders);
  const setGlobalCustomHeaders = useConfigStore((s) => s.setGlobalCustomHeaders);

  const [headers, setHeaders] = useState<Record<string, string>>(stored);

  const isDirty = JSON.stringify(headers) !== JSON.stringify(stored);

  // Edits live only in local state until Save: ask before they are lost.
  const guard = useUnsavedChangesGuard(isDirty, () => router.back());

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
      <BackHeader title="Custom Headers" onBack={guard.leave} />

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
        {...guard.discardModalProps}
        title="Discard changes?"
        message="Your header edits haven't been saved yet."
        tone="danger"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={guard.confirmDiscard}
      />
    </ScreenWrapper>
  );
}
