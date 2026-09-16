import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowRight, Network, Plus, Trash2 } from "lucide-react-native";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { TextInput } from "@/components/ui/text-input";
import { toast, toastError } from "@/components/ui/toast";
import { useActiveInstance } from "@/hooks/use-active-instance";
import {
  useAddAdguardRewrite,
  useAdguardRewrites,
  useDeleteAdguardRewrite,
} from "@/hooks/use-adguard";
import { ICON } from "@/lib/constants";
import {
  validateRewriteInput,
  type RewriteValidationErrors,
} from "@/lib/adguard-normalize";
import type { AdguardRewriteEntry } from "@/lib/types";

/**
 * Local DNS rewrites (AGH's `/rewrite` records). Mirrors
 * app/(tabs)/(pihole)/pihole/cnames.tsx: a list, a `+` in the header, and a
 * full-screen add form reached by a mode switch rather than a modal. That
 * keeps the text inputs inside ScreenWrapper's KeyboardAwareScrollView — the
 * "already handled" keyboard pattern — and means this screen has no modal
 * chain at all.
 *
 * There is no edit mode here either, even though AGH has a real
 * `PUT /rewrite/update` (unlike Pi-hole): editing is delete + re-add, kept
 * consistent with the Pi-hole screen rather than introducing a second UX for
 * one service.
 */
export default function AdguardRewritesScreen() {
  const { instances, activeId } = useActiveInstance("adguard");
  const activeName = instances.find((i) => i.id === activeId)?.name;

  const { data, isLoading } = useAdguardRewrites();
  const addRewrite = useAddAdguardRewrite();
  const deleteRewrite = useDeleteAdguardRewrite();
  const { refreshing, onRefresh } = usePullToRefresh([["adguard"]]);

  const [mode, setMode] = useState<"list" | "add">("list");
  const [domain, setDomain] = useState("");
  const [answer, setAnswer] = useState("");
  const [errors, setErrors] = useState<RewriteValidationErrors>({});
  const [pendingDelete, setPendingDelete] = useState<AdguardRewriteEntry | null>(null);

  const records = data ?? [];

  const resetForm = () => {
    setDomain("");
    setAnswer("");
    setErrors({});
  };

  const leaveForm = () => {
    resetForm();
    setMode("list");
  };

  const submit = () => {
    const found = validateRewriteInput(domain, answer, records);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    addRewrite.mutate(
      { domain: domain.trim(), answer: answer.trim() },
      {
        onSuccess: () => {
          toast("Record added");
          leaveForm();
        },
        onError: (err) => toastError("Couldn't add record", err),
      },
    );
  };

  const confirmDelete = () => {
    const record = pendingDelete;
    setPendingDelete(null);
    if (!record) return;
    // Deletes on the record exactly as stored — see deleteRewrite.
    deleteRewrite.mutate(record, {
      onSuccess: () => toast("Record deleted"),
      onError: (err) => toastError("Couldn't delete record", err),
    });
  };

  if (mode === "add") {
    return (
      <ScreenWrapper>
        <BackHeader title="Add DNS record" onBack={leaveForm} />
        <Card className="gap-4">
          <TextInput
            label="Domain"
            value={domain}
            onChangeText={setDomain}
            placeholder="nas.lan"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            error={errors.domain}
          />
          <TextInput
            label="Points to (IP or hostname)"
            value={answer}
            onChangeText={setAnswer}
            placeholder="192.168.1.7"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.answer}
          />
          <View className="flex-row gap-3">
            <Button
              label="Cancel"
              variant="outline"
              onPress={leaveForm}
              className="flex-1"
            />
            <Button
              label="Save"
              onPress={submit}
              loading={addRewrite.isPending}
              className="flex-1"
            />
          </View>
        </Card>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <BackHeader
        title="Local DNS"
        right={
          <Pressable
            onPress={() => setMode("add")}
            className="p-1 active:opacity-70"
            hitSlop={8}
          >
            <Icon icon={Plus} size={ICON.LG} color="#3b82f6" />
          </Pressable>
        }
      />
      {/* Deleting a record on the wrong AdGuard Home is unrecoverable, so name
          the instance whenever there is more than one. */}
      {instances.length > 1 && activeName ? (
        <Text className="text-zinc-500 text-xs -mt-2 mb-3">{activeName}</Text>
      ) : null}

      {isLoading && !data ? (
        <Card>
          <SkeletonCardContent rows={3} />
        </Card>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Network} size={ICON.XL} color="#71717a" />}
          title="No local DNS records"
          message="Point a local name at another host on your network."
          action={
            <Button label="Add record" size="sm" onPress={() => setMode("add")} />
          }
        />
      ) : (
        <Card className="gap-4">
          {records.map((record) => {
            const busy =
              deleteRewrite.isPending &&
              deleteRewrite.variables?.domain === record.domain &&
              deleteRewrite.variables?.answer === record.answer;
            const disabled = record.enabled === false;
            return (
              <View
                key={`${record.domain}-${record.answer}`}
                className={`flex-row items-center gap-3 ${disabled ? "opacity-50" : ""}`}
              >
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="text-zinc-100 text-sm font-medium"
                      numberOfLines={1}
                    >
                      {record.domain}
                    </Text>
                    {disabled ? (
                      <Text className="text-zinc-500 text-[0.65rem] uppercase">
                        Disabled
                      </Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Icon icon={ArrowRight} size={ICON.XS} color="#52525b" />
                    <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                      {record.answer}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setPendingDelete(record)}
                  disabled={busy}
                  className={`p-2 active:opacity-70 ${busy ? "opacity-50" : ""}`}
                  hitSlop={6}
                >
                  <Icon icon={Trash2} size={ICON.SM} color="#71717a" />
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}

      <ConfirmModal
        visible={pendingDelete !== null}
        title="Delete DNS record"
        message={
          pendingDelete
            ? `Remove ${pendingDelete.domain} pointing to ${pendingDelete.answer}?`
            : ""
        }
        icon={Trash2}
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </ScreenWrapper>
  );
}
