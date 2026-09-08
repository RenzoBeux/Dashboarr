import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  validateCustomServiceDefinition,
  type CustomServiceAction,
  type CustomServiceAuth,
  type CustomServiceDefinition,
  type CustomServiceHealth,
  type CustomServiceLogin,
  type CustomServiceStat,
} from "@/lib/custom-service";

// The full editor for a `custom` service instance's request/auth/health/
// stats/actions definition (lib/custom-service.ts). Fully controlled —
// `value`/`onChange` — so the host screen (ServiceEditor) owns persistence
// and the deferred-vs-instant save split every other kind already has.
//
// Requirement carried over from sibling item reviews: the username/password
// fields render whenever EITHER auth.mode is "basic" OR a login step is
// present, not only for "basic" — a login step's body can reference
// {{username}}/{{password}} while the primary auth mode stays "none" (the
// qBittorrent-shaped preset), so those two fields have to be visible for
// both reasons independently. See services/custom-api.ts substituteLoginBody.

const AUTH_MODE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "header", label: "Header" },
  { value: "query", label: "Query param" },
  { value: "basic", label: "HTTP Basic" },
  { value: "bearer", label: "Bearer token" },
] as const;

const HTTP_METHOD_OPTIONS = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
] as const;

const ACTION_METHOD_OPTIONS = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "DELETE", label: "DELETE" },
] as const;

const INJECT_AS_OPTIONS = [
  { value: "header", label: "Header" },
  { value: "query", label: "Query param" },
  { value: "cookie", label: "Cookie" },
  { value: "bearer", label: "Bearer token" },
] as const;

const STAT_FORMAT_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "bytes", label: "Bytes" },
  { value: "duration", label: "Duration" },
  { value: "percent", label: "Percent" },
] as const;

const MAX_STATS = 8;
const MAX_ACTIONS = 8;

interface CustomServiceEditorProps {
  value: CustomServiceDefinition;
  onChange: (def: CustomServiceDefinition) => void;
}

export function CustomServiceEditor({ value, onChange }: CustomServiceEditorProps) {
  const auth = value.auth ?? { mode: "none" as const };
  const showUserPass = auth.mode === "basic" || !!value.login;

  const setAuth = (patch: Partial<CustomServiceAuth>) => {
    onChange({ ...value, auth: { ...auth, ...patch } });
  };

  return (
    <View className="gap-4 mb-4">
      <Card className="gap-4">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Authentication
        </Text>

        <Select
          label="Auth mode"
          value={auth.mode}
          options={[...AUTH_MODE_OPTIONS]}
          onChange={(mode) => setAuth({ mode })}
        />

        {auth.mode === "header" ? (
          <>
            <TextInput
              label="Header name"
              placeholder="X-Api-Key"
              value={auth.headerName ?? ""}
              onChangeText={(headerName) => setAuth({ headerName })}
            />
            <TextInput
              label="Token"
              placeholder="Enter token"
              value={auth.token ?? ""}
              onChangeText={(token) => setAuth({ token })}
              secureTextEntry
              revealable
            />
          </>
        ) : null}

        {auth.mode === "query" ? (
          <>
            <TextInput
              label="Query param name"
              placeholder="apikey"
              value={auth.queryParam ?? ""}
              onChangeText={(queryParam) => setAuth({ queryParam })}
            />
            <TextInput
              label="Token"
              placeholder="Enter token"
              value={auth.token ?? ""}
              onChangeText={(token) => setAuth({ token })}
              secureTextEntry
              revealable
            />
          </>
        ) : null}

        {auth.mode === "bearer" ? (
          <TextInput
            label="Token"
            placeholder="Enter token"
            value={auth.token ?? ""}
            onChangeText={(token) => setAuth({ token })}
            secureTextEntry
            revealable
          />
        ) : null}

        {showUserPass ? (
          <>
            <TextInput
              label="Username"
              placeholder="admin"
              value={auth.username ?? ""}
              onChangeText={(username) => setAuth({ username })}
            />
            <TextInput
              label="Password"
              placeholder="••••••••"
              value={auth.password ?? ""}
              onChangeText={(password) => setAuth({ password })}
              secureTextEntry
              revealable
            />
          </>
        ) : null}
      </Card>

      <LoginStepSection value={value} onChange={onChange} />
      <HealthSection value={value} onChange={onChange} />
      <StatsSection value={value} onChange={onChange} />
      <ActionsSection value={value} onChange={onChange} />
      <ImportExportSection value={value} onChange={onChange} />
    </View>
  );
}

// ---- collapsible section shell -------------------------------------------

function CollapsibleCard({
  title,
  defaultExpanded = true,
  headerRight,
  children,
}: {
  title: string;
  defaultExpanded?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <Card className="gap-4">
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        className="flex-row items-center justify-between active:opacity-70"
        hitSlop={4}
      >
        <View className="flex-row items-center gap-2">
          <Icon icon={expanded ? ChevronDown : ChevronRight} size={16} color="#71717a" />
          <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            {title}
          </Text>
        </View>
        {headerRight}
      </Pressable>
      {expanded ? <View className="gap-4">{children}</View> : null}
    </Card>
  );
}

// ---- login step ------------------------------------------------------------

function LoginStepSection({
  value,
  onChange,
}: {
  value: CustomServiceDefinition;
  onChange: (def: CustomServiceDefinition) => void;
}) {
  const loginEnabled = !!value.login;
  const login: CustomServiceLogin = value.login ?? {
    method: "POST",
    path: "",
    injectAs: "cookie",
  };

  const setLogin = (patch: Partial<CustomServiceLogin>) => {
    onChange({ ...value, login: { ...login, ...patch } });
  };

  return (
    <Card className="gap-4">
      <Toggle
        label="Login step"
        description="Exchange credentials for a session before other requests (cookie/token login)."
        value={loginEnabled}
        onValueChange={(enabled) => {
          if (enabled) {
            onChange({ ...value, login });
          } else {
            const { login: _drop, ...rest } = value;
            onChange(rest);
          }
        }}
      />

      {loginEnabled ? (
        <>
          <Select
            label="Method"
            value={login.method}
            options={[...HTTP_METHOD_OPTIONS]}
            onChange={(method) => setLogin({ method })}
          />
          <TextInput
            label="Path"
            placeholder="/api/v2/auth/login"
            value={login.path}
            onChangeText={(path) => setLogin({ path })}
          />
          <TextInput
            label="Content-Type (optional)"
            placeholder="application/x-www-form-urlencoded"
            value={login.contentType ?? ""}
            onChangeText={(contentType) => setLogin({ contentType })}
          />
          <TextInput
            label="Body (optional)"
            placeholder="username={{username}}&password={{password}}"
            value={login.body ?? ""}
            onChangeText={(body) => setLogin({ body })}
            multiline
          />
          <TextInput
            label="Capture cookie name (optional)"
            placeholder="session"
            value={login.captureCookie ?? ""}
            onChangeText={(captureCookie) => setLogin({ captureCookie })}
          />
          <TextInput
            label="Capture JSON path (optional)"
            placeholder="token"
            value={login.captureJSONPath ?? ""}
            onChangeText={(captureJSONPath) => setLogin({ captureJSONPath })}
          />
          <Select
            label="Inject captured value as"
            value={login.injectAs}
            options={[...INJECT_AS_OPTIONS]}
            onChange={(injectAs) => setLogin({ injectAs })}
          />
          {login.injectAs !== "bearer" ? (
            <TextInput
              label="Inject name"
              placeholder={login.injectAs === "cookie" ? "session" : "X-Session-Token"}
              value={login.injectName ?? ""}
              onChangeText={(injectName) => setLogin({ injectName })}
            />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

// ---- health ----------------------------------------------------------------

function HealthSection({
  value,
  onChange,
}: {
  value: CustomServiceDefinition;
  onChange: (def: CustomServiceDefinition) => void;
}) {
  const health: CustomServiceHealth = value.health ?? { method: "GET", path: "" };

  const setHealth = (patch: Partial<CustomServiceHealth>) => {
    onChange({ ...value, health: { ...health, ...patch } });
  };

  return (
    <CollapsibleCard title="Health" defaultExpanded>
      <Select
        label="Method"
        value={health.method}
        options={[...HTTP_METHOD_OPTIONS]}
        onChange={(method) => setHealth({ method })}
      />
      <TextInput
        label="Path"
        placeholder="/api/status"
        value={health.path}
        onChangeText={(path) => setHealth({ path })}
      />
      <TextInput
        label="Body (optional)"
        value={health.body ?? ""}
        onChangeText={(body) => setHealth({ body })}
        multiline
      />
      <TextInput
        label="Status path (optional)"
        placeholder="data.status"
        value={health.statusPath ?? ""}
        onChangeText={(statusPath) => setHealth({ statusPath })}
      />
      <TextInput
        label="OK values (comma-separated, optional)"
        placeholder="ok, true, healthy"
        value={(health.okValues ?? []).join(", ")}
        onChangeText={(text) => setHealth({ okValues: splitList(text) })}
      />
      <TextInput
        label="Warning values (comma-separated, optional)"
        placeholder="degraded"
        value={(health.warnValues ?? []).join(", ")}
        onChangeText={(text) => setHealth({ warnValues: splitList(text) })}
      />
      <TextInput
        label="Version path (optional)"
        placeholder="data.version"
        value={health.versionPath ?? ""}
        onChangeText={(versionPath) => setHealth({ versionPath })}
      />
    </CollapsibleCard>
  );
}

function splitList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---- stats -------------------------------------------------------------

function StatsSection({
  value,
  onChange,
}: {
  value: CustomServiceDefinition;
  onChange: (def: CustomServiceDefinition) => void;
}) {
  const stats = value.stats ?? [];

  const updateStat = (index: number, patch: Partial<CustomServiceStat>) => {
    const next = stats.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...value, stats: next });
  };

  const removeStat = (index: number) => {
    onChange({ ...value, stats: stats.filter((_, i) => i !== index) });
  };

  const addStat = () => {
    if (stats.length >= MAX_STATS) return;
    onChange({
      ...value,
      stats: [...stats, { label: "", path: "", format: "text" as const }],
    });
  };

  return (
    <CollapsibleCard
      title="Stats"
      headerRight={
        <Text className="text-zinc-600 text-xs">
          {stats.length}/{MAX_STATS}
        </Text>
      }
    >
      {stats.length === 0 ? (
        <Text className="text-zinc-500 text-xs">
          No stats yet. Tap "Add stat" to show a value on the tab and
          dashboard card.
        </Text>
      ) : (
        stats.map((stat, index) => (
          <View key={index} className="gap-2 pb-2 border-b border-border/60 last:border-b-0">
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <TextInput
                  label="Label"
                  placeholder="Downloads"
                  value={stat.label}
                  onChangeText={(label) => updateStat(index, { label })}
                />
              </View>
              <Pressable
                onPress={() => removeStat(index)}
                className="bg-surface-light rounded-xl p-3 mb-0.5 active:opacity-70"
                accessibilityLabel={`Remove stat ${index + 1}`}
              >
                <Icon icon={Trash2} size={18} color="#a1a1aa" />
              </Pressable>
            </View>
            <TextInput
              label="JSON path"
              placeholder="data.downloads"
              value={stat.path}
              onChangeText={(path) => updateStat(index, { path })}
            />
            <TextInput
              label="Unit (optional)"
              placeholder="MB/s"
              value={stat.unit ?? ""}
              onChangeText={(unit) => updateStat(index, { unit })}
            />
            <Select
              label="Format"
              value={stat.format ?? "text"}
              options={[...STAT_FORMAT_OPTIONS]}
              onChange={(format) => updateStat(index, { format })}
            />
          </View>
        ))
      )}

      <Pressable
        onPress={addStat}
        disabled={stats.length >= MAX_STATS}
        testID="custom-add-stat"
        className={`flex-row items-center justify-center gap-2 bg-surface-light rounded-xl py-3 ${
          stats.length >= MAX_STATS ? "opacity-50" : "active:opacity-70"
        }`}
      >
        <Icon icon={Plus} size={16} color="#a1a1aa" />
        <Text className="text-zinc-300 text-sm font-medium">Add stat</Text>
      </Pressable>
    </CollapsibleCard>
  );
}

// ---- actions -------------------------------------------------------------

function ActionsSection({
  value,
  onChange,
}: {
  value: CustomServiceDefinition;
  onChange: (def: CustomServiceDefinition) => void;
}) {
  const actions = value.actions ?? [];

  const updateAction = (index: number, patch: Partial<CustomServiceAction>) => {
    const next = actions.map((a, i) => (i === index ? { ...a, ...patch } : a));
    onChange({ ...value, actions: next });
  };

  const removeAction = (index: number) => {
    onChange({ ...value, actions: actions.filter((_, i) => i !== index) });
  };

  const addAction = () => {
    if (actions.length >= MAX_ACTIONS) return;
    onChange({
      ...value,
      actions: [
        ...actions,
        { id: `action-${actions.length + 1}`, label: "", method: "POST" as const, path: "" },
      ],
    });
  };

  return (
    <CollapsibleCard
      title="Actions"
      headerRight={
        <Text className="text-zinc-600 text-xs">
          {actions.length}/{MAX_ACTIONS}
        </Text>
      }
    >
      {actions.length === 0 ? (
        <Text className="text-zinc-500 text-xs">
          No actions yet. Tap "Add action" to show a button on the tab and
          dashboard card.
        </Text>
      ) : (
        actions.map((action, index) => (
          <View key={index} className="gap-2 pb-2 border-b border-border/60 last:border-b-0">
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <TextInput
                  label="Label"
                  placeholder="Restart"
                  value={action.label}
                  onChangeText={(label) => updateAction(index, { label })}
                />
              </View>
              <Pressable
                onPress={() => removeAction(index)}
                className="bg-surface-light rounded-xl p-3 mb-0.5 active:opacity-70"
                accessibilityLabel={`Remove action ${index + 1}`}
              >
                <Icon icon={Trash2} size={18} color="#a1a1aa" />
              </Pressable>
            </View>
            <TextInput
              label="Id"
              placeholder="restart"
              value={action.id}
              onChangeText={(id) => updateAction(index, { id })}
              autoCapitalize="none"
            />
            <Select
              label="Method"
              value={action.method}
              options={[...ACTION_METHOD_OPTIONS]}
              onChange={(method) => updateAction(index, { method })}
            />
            <TextInput
              label="Path"
              placeholder="/api/restart"
              value={action.path}
              onChangeText={(path) => updateAction(index, { path })}
            />
            <TextInput
              label="Body (optional)"
              value={action.body ?? ""}
              onChangeText={(body) => updateAction(index, { body })}
              multiline
            />
            <Toggle
              label="Confirm before running"
              description="Show a confirmation dialog before calling this action."
              value={action.confirm ?? false}
              onValueChange={(confirm) => updateAction(index, { confirm })}
            />
          </View>
        ))
      )}

      <Pressable
        onPress={addAction}
        disabled={actions.length >= MAX_ACTIONS}
        testID="custom-add-action"
        className={`flex-row items-center justify-center gap-2 bg-surface-light rounded-xl py-3 ${
          actions.length >= MAX_ACTIONS ? "opacity-50" : "active:opacity-70"
        }`}
      >
        <Icon icon={Plus} size={16} color="#a1a1aa" />
        <Text className="text-zinc-300 text-sm font-medium">Add action</Text>
      </Pressable>
    </CollapsibleCard>
  );
}

// ---- import / export -------------------------------------------------------

function ImportExportSection({
  value,
  onChange,
}: {
  value: CustomServiceDefinition;
  onChange: (def: CustomServiceDefinition) => void;
}) {
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const handleImport = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportErrors(["Invalid JSON — could not parse"]);
      return;
    }
    const result = validateCustomServiceDefinition(parsed);
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    setImportErrors([]);
    onChange(result.value);
    toast("Definition imported", "success");
  };

  const handleExport = async () => {
    await Clipboard.setStringAsync(JSON.stringify(value, null, 2));
    toast("Definition copied to clipboard", "success");
  };

  return (
    <Card className="gap-4">
      <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
        Import / Export
      </Text>

      <TextInput
        label="Paste JSON to import"
        placeholder="{ &quot;auth&quot;: { &quot;mode&quot;: &quot;none&quot; }, ... }"
        value={importText}
        onChangeText={(text) => {
          setImportText(text);
          if (importErrors.length > 0) setImportErrors([]);
        }}
        multiline
        autoCapitalize="none"
        testID="custom-import-input"
      />

      {importErrors.length > 0 ? (
        <View testID="custom-import-error">
          {importErrors.map((err, i) => (
            <Text key={i} className="text-danger text-xs">
              {err}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <Button
          label="Import JSON"
          variant="outline"
          onPress={handleImport}
          className="flex-1"
        />
        <Button
          label="Copy JSON"
          variant="outline"
          onPress={() => void handleExport()}
          className="flex-1"
        />
      </View>
    </Card>
  );
}
