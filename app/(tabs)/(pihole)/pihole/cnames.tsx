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
  useAddPiholeCname,
  useDeletePiholeCname,
  usePiholeCnameRecords,
} from "@/hooks/use-pihole";
import { ICON } from "@/lib/constants";
import {
  piholeErrorMessage,
  validateCnameInput,
  type CnameValidationErrors,
  type PiholeCnameRecord,
} from "@/lib/pihole-normalize";

/**
 * Local CNAME records (Pi-hole's `dns.cnameRecords`).
 *
 * Copies app/wake-on-lan.tsx: a list, a `+` in the header, and a full-screen
 * add form reached by a mode switch rather than a modal. That keeps the text
 * inputs inside ScreenWrapper's KeyboardAwareScrollView — the "already handled"
 * keyboard pattern — and means this screen has no modal chain at all.
 *
 * There is no edit mode. Pi-hole has no single-record update endpoint, so
 * editing is delete + re-add; a fake Edit that silently deletes on failure is
 * worse than being honest about it.
 */
export default function PiholeCnamesScreen() {
  const { instances, activeId } = useActiveInstance("pihole");
  const activeName = instances.find((i) => i.id === activeId)?.name;

  const { data, isLoading } = usePiholeCnameRecords();
  const addCname = useAddPiholeCname();
  const deleteCname = useDeletePiholeCname();
  const { refreshing, onRefresh } = usePullToRefresh([["pihole"]]);

  const [mode, setMode] = useState<"list" | "add">("list");
  const [cname, setCname] = useState("");
  const [target, setTarget] = useState("");
  const [ttl, setTtl] = useState("");
  const [errors, setErrors] = useState<CnameValidationErrors>({});
  const [pendingDelete, setPendingDelete] = useState<PiholeCnameRecord | null>(null);

  const records = data ?? [];

  const resetForm = () => {
    setCname("");
    setTarget("");
    setTtl("");
    setErrors({});
  };

  const leaveForm = () => {
    resetForm();
    setMode("list");
  };

  const submit = () => {
    const found = validateCnameInput(
      cname,
      target,
      ttl,
      records.map((r) => r.raw),
    );
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const trimmedTtl = ttl.trim();
    addCname.mutate(
      {
        cname: cname.trim(),
        target: target.trim(),
        ttl: trimmedTtl === "" ? null : Number(trimmedTtl),
      },
      {
        onSuccess: () => {
          toast("Record added");
          leaveForm();
        },
        onError: (err) =>
          toastError("Couldn't add record", err, piholeErrorMessage),
      },
    );
  };

  const confirmDelete = () => {
    const record = pendingDelete;
    setPendingDelete(null);
    if (!record) return;
    // Deletes on record.raw, not a re-formatted value — FTL matches the stored
    // string byte-for-byte (see deleteCnameRecord).
    deleteCname.mutate(record, {
      onSuccess: () => toast("Record deleted"),
      onError: (err) =>
        toastError("Couldn't delete record", err, piholeErrorMessage),
    });
  };

  if (mode === "add") {
    return (
      <ScreenWrapper>
        <BackHeader title="Add DNS record" onBack={leaveForm} />
        <Card className="gap-4">
          <TextInput
            label="Name"
            value={cname}
            onChangeText={setCname}
            placeholder="nas.lan"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            error={errors.cname}
          />
          <TextInput
            label="Points to"
            value={target}
            onChangeText={setTarget}
            placeholder="server.lan"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.target}
          />
          <TextInput
            label="TTL (optional)"
            value={ttl}
            onChangeText={setTtl}
            placeholder="3600"
            keyboardType="number-pad"
            error={errors.ttl}
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
              loading={addCname.isPending}
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
      {/* Deleting a record on the wrong Pi-hole is unrecoverable, so name the
          instance whenever there is more than one. */}
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
              deleteCname.isPending && deleteCname.variables?.raw === record.raw;
            return (
              <View key={record.raw} className="flex-row items-center gap-3">
                <View className="flex-1 min-w-0">
                  <Text
                    className="text-zinc-100 text-sm font-medium"
                    numberOfLines={1}
                  >
                    {record.cname}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Icon icon={ArrowRight} size={ICON.XS} color="#52525b" />
                    <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                      {record.target}
                    </Text>
                    {record.ttl !== null ? (
                      <Text className="text-zinc-600 text-xs">
                        TTL {record.ttl}
                      </Text>
                    ) : null}
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
            ? `Remove ${pendingDelete.cname} pointing to ${pendingDelete.target}?`
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
