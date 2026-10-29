import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ListFilter, Plus, Trash2 } from "lucide-react-native";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { TextInput } from "@/components/ui/text-input";
import { toast, toastError } from "@/components/ui/toast";
import { useActiveInstance } from "@/hooks/use-active-instance";
import {
  useAddAdguardRule,
  useAdguardDomainRule,
  useAdguardFilterStatus,
  useRemoveAdguardRule,
} from "@/hooks/use-adguard";
import { ICON } from "@/lib/constants";
import {
  allowRuleFor,
  blockRuleFor,
  normalizeRuleDomain,
  parseAdguardRule,
  userRulesOf,
  type AdguardRuleKind,
} from "@/lib/adguard-rules";

type AddMode = "allow" | "block" | "raw";

const ADD_MODES: { key: AddMode; label: string }[] = [
  { key: "allow", label: "Allow" },
  { key: "block", label: "Block" },
  { key: "raw", label: "Raw rule" },
];

type ListFilterKey = "all" | "allow" | "block" | "other";

const LIST_FILTERS: { key: ListFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "allow", label: "Allowed" },
  { key: "block", label: "Blocked" },
  { key: "other", label: "Other" },
];

const KIND_META: Record<AdguardRuleKind, { label: string; variant: BadgeVariant }> = {
  allow: { label: "Allow", variant: "success" },
  block: { label: "Block", variant: "error" },
  comment: { label: "Comment", variant: "default" },
  other: { label: "Rule", variant: "info" },
};

/**
 * AdGuard Home's custom filtering rules (`user_rules`). Same shape as the
 * Local DNS screen: a list, a `+` in the header, and a full-screen add form
 * reached by a mode switch so the inputs stay inside ScreenWrapper's
 * KeyboardAwareScrollView and the screen has no modal chain beyond the
 * single delete confirm.
 *
 * The form writes the two rule shapes most people want — `@@||domain^`
 * (allow) and `||domain^` (block) — from a plain domain, with a raw mode for
 * anything else in AdGuard's syntax. Rules the app did not write are listed
 * verbatim and only ever deleted whole, never rewritten.
 */
export default function AdguardRulesScreen() {
  const { instances, activeId } = useActiveInstance("adguard");
  const activeName = instances.find((i) => i.id === activeId)?.name;

  const { data, isLoading } = useAdguardFilterStatus();
  const domainRule = useAdguardDomainRule();
  const addRule = useAddAdguardRule();
  const removeRule = useRemoveAdguardRule();
  const { refreshing, onRefresh } = usePullToRefresh([["adguard"]]);

  const [mode, setMode] = useState<"list" | "add">("list");
  const [addMode, setAddMode] = useState<AddMode>("allow");
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | undefined>();
  const [listFilter, setListFilter] = useState<ListFilterKey>("all");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const rules = userRulesOf(data);
  const parsed = useMemo(() => rules.map(parseAdguardRule), [rules]);
  const visible = useMemo(() => {
    if (listFilter === "all") return parsed;
    if (listFilter === "other") return parsed.filter((r) => r.kind === "other" || r.kind === "comment");
    return parsed.filter((r) => r.kind === listFilter);
  }, [parsed, listFilter]);

  const resetForm = () => {
    setInput("");
    setInputError(undefined);
  };

  const leaveForm = () => {
    resetForm();
    setMode("list");
  };

  // What the form will actually write, shown live under the input so a
  // typo in the domain is visible before it lands in the rules box.
  const preview = useMemo(() => {
    const value = input.trim();
    if (value === "") return "";
    if (addMode === "raw") return value;
    const domain = normalizeRuleDomain(value);
    if (!domain) return "";
    return addMode === "allow" ? allowRuleFor(domain) : blockRuleFor(domain);
  }, [input, addMode]);

  const submit = () => {
    const value = input.trim();
    if (addMode === "raw") {
      if (!value) {
        setInputError("Enter a rule");
        return;
      }
      if (rules.includes(value)) {
        setInputError("This rule already exists");
        return;
      }
      addRule.mutate(value, {
        onSuccess: () => {
          toast("Rule added");
          leaveForm();
        },
        onError: (err) => toastError("Couldn't add rule", err),
      });
      return;
    }

    const domain = normalizeRuleDomain(value);
    if (!domain) {
      setInputError(value ? "Enter a valid domain" : "Enter a domain");
      return;
    }
    domainRule.mutate(
      { domain, change: addMode },
      {
        onSuccess: (edit) => {
          toast(
            edit.removed.length > 0
              ? `${domain} is now ${addMode === "allow" ? "allowed" : "blocked"} (replaced ${edit.removed.length} rule${edit.removed.length === 1 ? "" : "s"})`
              : `${domain} is now ${addMode === "allow" ? "allowed" : "blocked"}`,
          );
          leaveForm();
        },
        onError: (err) => toastError("Couldn't add rule", err),
      },
    );
  };

  const confirmDelete = () => {
    const line = pendingDelete;
    setPendingDelete(null);
    if (line === null) return;
    removeRule.mutate(line, {
      onSuccess: () => toast("Rule removed"),
      onError: (err) => toastError("Couldn't remove rule", err),
    });
  };

  const saving = domainRule.isPending || addRule.isPending;

  if (mode === "add") {
    return (
      <ScreenWrapper>
        <BackHeader title="Add rule" onBack={leaveForm} />
        <Card className="gap-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {ADD_MODES.map((m) => (
              <FilterChip
                key={m.key}
                label={m.label}
                selected={addMode === m.key}
                onPress={() => {
                  setAddMode(m.key);
                  setInputError(undefined);
                }}
              />
            ))}
          </ScrollView>
          <TextInput
            label={addMode === "raw" ? "Rule" : "Domain"}
            value={input}
            onChangeText={(v) => {
              setInput(v);
              if (inputError) setInputError(undefined);
            }}
            placeholder={addMode === "raw" ? "||ads.example.com^$important" : "ads.example.com"}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            error={inputError}
          />
          <Text className="text-zinc-500 text-xs">
            {addMode === "allow"
              ? "Lets this domain and its subdomains through, even when a filter list blocks it."
              : addMode === "block"
                ? "Blocks this domain and its subdomains for every client."
                : "Any rule in AdGuard's filtering syntax, stored as typed."}
          </Text>
          {preview ? (
            <View className="bg-zinc-800/60 rounded-lg px-3 py-2">
              <Text className="text-zinc-500 text-[0.65rem] uppercase mb-0.5">Will add</Text>
              <Text className="text-zinc-200 text-sm font-mono" numberOfLines={2}>
                {preview}
              </Text>
            </View>
          ) : null}
          <View className="flex-row gap-3">
            <Button label="Cancel" variant="outline" onPress={leaveForm} className="flex-1" />
            <Button label="Save" onPress={submit} loading={saving} className="flex-1" />
          </View>
        </Card>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <BackHeader
        title="Custom rules"
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
      {/* Removing a rule on the wrong AdGuard Home re-blocks (or re-allows)
          something silently, so name the instance whenever there is more
          than one. */}
      {instances.length > 1 && activeName ? (
        <Text className="text-zinc-500 text-xs -mt-2 mb-3">{activeName}</Text>
      ) : null}

      {parsed.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
          className="mb-3"
        >
          {LIST_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              selected={listFilter === f.key}
              onPress={() => setListFilter(f.key)}
            />
          ))}
        </ScrollView>
      ) : null}

      {isLoading && !data ? (
        <Card>
          <SkeletonCardContent rows={3} />
        </Card>
      ) : parsed.length === 0 ? (
        <EmptyState
          icon={<Icon icon={ListFilter} size={ICON.XL} color="#71717a" />}
          title="No custom rules"
          message="Allow a domain a filter list blocks, or block one it lets through."
          action={<Button label="Add rule" size="sm" onPress={() => setMode("add")} />}
        />
      ) : visible.length === 0 ? (
        <EmptyState compact title="Nothing matches this filter" />
      ) : (
        <Card className="gap-4">
          {visible.map((rule, index) => {
            const meta = KIND_META[rule.kind];
            const busy = removeRule.isPending && removeRule.variables === rule.text;
            return (
              <View
                key={`${index}-${rule.text}`}
                className={`flex-row items-center gap-3 ${rule.kind === "comment" ? "opacity-60" : ""}`}
              >
                <View className="flex-1 min-w-0">
                  <Text
                    className={`text-sm ${rule.domain ? "text-zinc-100 font-medium" : "text-zinc-300 font-mono"}`}
                    numberOfLines={2}
                  >
                    {rule.domain ?? rule.text.trim()}
                  </Text>
                  {rule.domain && (rule.modifiers || rule.text.trim() !== (rule.kind === "allow" ? allowRuleFor(rule.domain) : blockRuleFor(rule.domain))) ? (
                    <Text className="text-zinc-500 text-xs font-mono" numberOfLines={1}>
                      {rule.text.trim()}
                    </Text>
                  ) : null}
                </View>
                <Badge label={meta.label} variant={meta.variant} />
                <Pressable
                  onPress={() => setPendingDelete(rule.text)}
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
        title="Remove rule"
        message={pendingDelete !== null ? `Remove "${pendingDelete.trim()}" from the custom rules?` : ""}
        icon={Trash2}
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </ScreenWrapper>
  );
}
