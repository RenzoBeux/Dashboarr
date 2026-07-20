import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, BackHandler, Pressable, Linking, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "expo-router";
import { toast, toastError } from "@/components/ui/toast";
import { Trash2, Copy, LogIn } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Select } from "@/components/ui/select";
import { HeaderListEditor } from "@/components/ui/header-list-editor";
import { useConfigStore } from "@/store/config-store";
import { useBackendStore } from "@/store/backend-store";
import { BackHeader } from "@/components/common/back-header";
import { testServiceConnection } from "@/lib/http-client";
import { qbClearSession } from "@/services/qbittorrent-api";
import { getPlexClientId } from "@/lib/plex-client-id";
import {
  requestPin,
  buildAuthUrl,
  pollPinForToken,
  discoverServers,
  type PlexServer,
} from "@/services/plex-auth";
import type { ServiceId } from "@/lib/constants";
import {
  CATEGORIES_FOR_KIND,
  CATEGORY_LABELS,
  type NotifCategory,
} from "@/lib/notification-categories";
import { validateServiceUrl, normalizeServiceUrl } from "@/lib/url-validation";
import { brrrHaptic } from "@/lib/haptics";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { ActionSheet } from "@/components/ui/action-sheet";
import { ArrDefaultsCard } from "@/components/settings/arr-defaults-card";
import {
  SERVICE_DEFAULTS_KIND_LABEL,
  EMPTY_INSTANCES,
  EMPTY_SECRETS,
  WEBHOOK_KINDS,
} from "@/components/settings/service-kind-shared";
import { AddToDashboardsSheet } from "@/components/dashboard/add-to-dashboards-sheet";

export function ServiceEditor({
  serviceId,
  instanceId,
  isNew,
  onBack,
  onDeleted,
}: {
  serviceId: ServiceId;
  instanceId: string;
  isNew: boolean;
  onBack: () => void;
  onDeleted: () => void;
}) {
  // The instance row is read directly off the multi-instance state. If the
  // user deleted this instance from elsewhere mid-edit, we surface a
  // not-found state instead of crashing on `.localUrl` of undefined.
  const inst = useConfigStore((s) =>
    (s.serviceInstances[serviceId] ?? EMPTY_INSTANCES).find((i) => i.id === instanceId),
  );
  const secrets = useConfigStore(
    (s) => s.instanceSecrets[instanceId] ?? EMPTY_SECRETS,
  );
  const instancesForKind = useConfigStore(
    (s) => s.serviceInstances[serviceId] ?? EMPTY_INSTANCES,
  );
  const updateInstance = useConfigStore((s) => s.updateInstance);
  const updateInstanceSecrets = useConfigStore((s) => s.updateInstanceSecrets);
  const toggleInstance = useConfigStore((s) => s.toggleInstance);
  const removeInstance = useConfigStore((s) => s.removeInstance);

  // First-save dashboard prompt is offered exactly once per editor session,
  // after the user saves an instance whose initial state was unconfigured
  // (no URL, no credentials). `promptShown` keeps us from re-asking on
  // subsequent saves in the same session if the user already engaged with
  // (or skipped) the sheet.
  const [promptShown, setPromptShown] = useState(false);

  const config = inst ?? {
    enabled: false,
    name: SERVICE_DEFAULTS_KIND_LABEL[serviceId],
    localUrl: "",
    remoteUrl: "",
    useRemote: false,
    ignoreCertErrors: false,
  };

  const [name, setName] = useState(config.name);
  const [localUrl, setLocalUrl] = useState(config.localUrl);
  const [remoteUrl, setRemoteUrl] = useState(config.remoteUrl);
  const [apiKey, setApiKey] = useState(secrets.apiKey ?? "");
  const [username, setUsername] = useState(secrets.username ?? "");
  const [password, setPassword] = useState(secrets.password ?? "");
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>(
    secrets.customHeaders ?? {},
  );
  const [testing, setTesting] = useState(false);
  // "Connect with Plex" PIN-OAuth flow (Plex-only). The poll loop is cancelled
  // on browser-dismiss and on editor unmount via this controller.
  const [connecting, setConnecting] = useState(false);
  const plexAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => plexAbortRef.current?.abort(), []);

  // Modal sequencing (unsaved sheet → save/discard, HTTP warning → save
  // continuation, delete/close → editor unmount) goes through the flow — see
  // hooks/use-modal-flow.ts. The HTTP-warning promise resolves only once the
  // confirm is fully dismissed, so handleSave's continuation (AddToDashboards
  // sheet or onBack's unmount) never runs mid-dismiss.
  const flow = useModalFlow<{
    unsaved: void;
    confirmDelete: void;
    addToDashboards: void;
    httpWarning: { message: string; resolve: (ok: boolean) => void };
    serverPicker: PlexServer[];
  }>();

  const usesBasicAuth =
    serviceId === "qbittorrent" ||
    serviceId === "rtorrent" ||
    serviceId === "transmission" ||
    serviceId === "glances" ||
    serviceId === "nzbget";

  // Snapshot at mount whether this instance has never been configured before
  // (no URL, no creds). Covers two flows that should both surface the prompt:
  //   1. User taps "Add another instance" — `addInstance` creates an empty
  //      slot which arrives here unconfigured.
  //   2. User opens the fresh-install placeholder slot for a kind they've
  //      never used (Bazarr after a reinstall, the default Sonarr row, etc.)
  //      and configures it for the first time — no `addInstance` was called
  //      so `isNew` is false, but this is still functionally a first-time
  //      add from the user's perspective.
  // Re-configuring an already-set-up instance (URL or creds present) won't
  // trigger the prompt — the snapshot stays false through the session.
  const [wasInitiallyUnconfigured] = useState(
    () =>
      config.localUrl.length === 0 &&
      config.remoteUrl.length === 0 &&
      (usesBasicAuth
        ? !secrets.username && !secrets.password
        : !secrets.apiKey),
  );

  const headersJson = JSON.stringify(customHeaders);
  const savedHeadersJson = JSON.stringify(secrets.customHeaders ?? {});

  const isDirty =
    name !== config.name ||
    localUrl !== config.localUrl ||
    remoteUrl !== config.remoteUrl ||
    headersJson !== savedHeadersJson ||
    (usesBasicAuth
      ? username !== (secrets.username ?? "") || password !== (secrets.password ?? "")
      : apiKey !== (secrets.apiKey ?? ""));

  const handleBack = () => {
    if (!isDirty) {
      onBack();
      return;
    }
    flow.open("unsaved");
  };

  // Intercept Android hardware back / swipe-back so it closes the editor
  // (with the unsaved-changes guard) instead of popping the Settings tab.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack]),
  );

  const confirmHttpWarning = (message: string) =>
    new Promise<boolean>((resolve) => {
      flow.open("httpWarning", { message, resolve });
    });

  const handleSave = async () => {
    if (!inst) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Name cannot be empty", "error");
      return;
    }

    const normLocal = normalizeServiceUrl(localUrl);
    const normRemote = normalizeServiceUrl(remoteUrl);
    setLocalUrl(normLocal);
    setRemoteUrl(normRemote);

    const localResult = validateServiceUrl(normLocal, "local");
    if (localResult.kind === "invalid") {
      toast(localResult.message, "error");
      return;
    }
    const remoteResult = validateServiceUrl(normRemote, "remote");
    if (remoteResult.kind === "invalid") {
      toast(remoteResult.message, "error");
      return;
    }
    if (remoteResult.kind === "warn") {
      const confirmed = await confirmHttpWarning(remoteResult.message);
      if (!confirmed) return;
    }

    // Mirror the schema validator so the user can't save an invalid header
    // map and then have hydrate() silently drop it after a restart.
    const headerNameRe = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
    for (const [name, val] of Object.entries(customHeaders)) {
      if (!headerNameRe.test(name)) {
        toast(`Invalid header name: "${name}"`, "error");
        return;
      }
      if (/[\r\n]/.test(val)) {
        toast(`Header "${name}" value contains newlines`, "error");
        return;
      }
    }

    updateInstance(serviceId, instanceId, {
      name: trimmedName,
      localUrl: normLocal,
      remoteUrl: normRemote,
    });
    if (usesBasicAuth) {
      await updateInstanceSecrets(instanceId, {
        username,
        password,
        customHeaders,
      });
    } else {
      await updateInstanceSecrets(instanceId, { apiKey, customHeaders });
    }
    // Drop the cached qBittorrent SID so the next request re-logs in with the
    // new URL or credentials. (glances and nzbget reuse the basic-auth form
    // but have no session to clear.)
    if (serviceId === "qbittorrent") {
      await qbClearSession(instanceId);
    }

    // First-save dashboard prompt. Fires once per editor session when the
    // instance was unconfigured on entry (either freshly added via "Add
    // another instance" or the untouched fresh-install placeholder) and the
    // save produced a usable config (URL + credential). The sheet always
    // opens — even when every existing dashboard is auto-attach and would
    // implicitly include the new instance — because users on the default
    // single-workspace install still benefit from seeing where it landed
    // and the hint that widgets are added separately.
    if ((isNew || wasInitiallyUnconfigured) && !promptShown) {
      const hasUrl = normLocal.length > 0 || normRemote.length > 0;
      const hasCreds = usesBasicAuth
        ? username.length > 0 || password.length > 0
        : apiKey.length > 0;
      if (hasUrl && hasCreds) {
        setPromptShown(true);
        flow.open("addToDashboards");
        return;
      }
    }

    onBack();
  };

  const handleTest = async () => {
    setTesting(true);
    // Resolve which URL the app will actually use right now, mirroring
    // getActiveUrl: the per-instance "always remote" override OR auto-switch
    // deciding we're away from home (in which case the app uses remote only and
    // never the local URL). We test the in-progress form values, not the saved
    // ones, so Test validates what the user typed before they Save.
    const { autoSwitchNetwork, networkAwayFromHome } = useConfigStore.getState();
    const useRemote =
      config.useRemote || (autoSwitchNetwork && networkAwayFromHome);
    const which = useRemote ? "remote" : "local";
    const rawTestUrl = useRemote ? remoteUrl : localUrl;
    const testUrl = normalizeServiceUrl(rawTestUrl);
    if (testUrl !== rawTestUrl) {
      if (useRemote) setRemoteUrl(testUrl);
      else setLocalUrl(testUrl);
    }
    // The URL the app would actually use is empty — explain *why* instead of
    // letting the fetch layer surface a bare "invalid URL" (#168). The common
    // case: auto-switch decided we're away from home, so it's remote-only, but
    // no remote URL is set for this service.
    if (!testUrl) {
      setTesting(false);
      if (useRemote && !config.useRemote && autoSwitchNetwork && networkAwayFromHome) {
        toast(
          "Away from home: Dashboarr is using remote URLs only, but none is set here. Add a remote URL, or turn off Auto-switch network if this device stays on your home WiFi.",
          "error",
        );
      } else {
        toast(`No ${which} URL set for this service`, "error");
      }
      return;
    }
    const result = await testServiceConnection(serviceId, {
      url: testUrl,
      apiKey,
      username,
      password,
      customHeaders,
    });
    setTesting(false);

    if (result.kind === "ok") {
      toast(`Connected via ${which} URL in ${result.responseTime}ms`, "success");
    } else if (result.kind === "auth_failed") {
      toast(`Auth failed (${which} URL): ${result.message}`, "error");
    } else {
      toast(`Could not reach ${which} URL: ${result.message}`, "error");
    }
  };

  // Fill the in-progress form from a discovered server. The user still reviews
  // and taps Save (consistent with manual entry), so this never writes directly.
  const applyServer = (server: PlexServer) => {
    setApiKey(server.accessToken);
    setLocalUrl(server.localUrl);
    setRemoteUrl(server.remoteUrl);
    // Adopt the server's name only if the user hasn't given it a custom one.
    setName((prev) =>
      prev.trim().length === 0 || prev === SERVICE_DEFAULTS_KIND_LABEL[serviceId]
        ? server.name
        : prev,
    );
    toast(`Connected to ${server.name}`, "success");
  };

  // Discover servers from the approved token and either auto-fill (0/1 server)
  // or present the picker (2+).
  const finishPlexConnect = async (token: string, clientId: string) => {
    try {
      const servers = await discoverServers(token, clientId);
      if (servers.length === 0) {
        // Token is valid even without a discoverable server (custom proxy,
        // offline server) — set it so manual URL entry still works.
        setApiKey(token);
        toast("Signed in, but no Plex servers found on this account", "error");
        return;
      }
      if (servers.length === 1) {
        applyServer(servers[0]);
        return;
      }
      // Yield a macrotask so the in-app browser's view controller is fully gone
      // before the ActionSheet presents (iOS two-VC hang, issue #83). The
      // discovery network round-trip above usually covers this, but make it
      // explicit.
      await new Promise((resolve) => setTimeout(resolve, 16));
      flow.open("serverPicker", servers);
    } catch (e) {
      toastError("Plex sign-in failed", e);
    }
  };

  const handleConnectPlex = async () => {
    if (connecting) return;
    setConnecting(true);
    const controller = new AbortController();
    plexAbortRef.current = controller;
    try {
      const clientId = await getPlexClientId();
      const pin = await requestPin(clientId);
      const authUrl = buildAuthUrl(pin.code, clientId);
      // The 5-min cap is only a backstop — a dismissed browser is detected as a
      // cancel well before this (see below).
      const timeoutMs = pin.expiresIn
        ? Math.min(pin.expiresIn * 1000, 300000)
        : 300000;

      const tokenPromise = pollPinForToken(pin.id, clientId, {
        signal: controller.signal,
        timeoutMs,
      });
      const safeToken = tokenPromise.catch(() => null);

      // Open the approval page in the system in-app browser (SFSafariViewController
      // / Chrome Custom Tabs). Unlike an embedded WebView, it shares the device's
      // browser session, so "Sign in with Google/Apple" uses the account you're
      // already signed into. This is how plezy and other mobile Plex clients do
      // it. Its promise resolves when the user dismisses it.
      const browserClosed = WebBrowser.openBrowserAsync(authUrl).catch(() => {
        void Linking.openURL(authUrl).catch(() => {});
        // External browser gives no close signal — never resolve this arm.
        return new Promise<WebBrowser.WebBrowserResult>(() => {});
      });

      // Finish as soon as the token is approved (poll wins). If the user instead
      // dismisses the browser without approving, treat it as a cancel — but
      // first give the poll a grace window to surface a just-approved token. On
      // Android the poll is suspended while the tab is open and only resumes on
      // return, so it needs longer than iOS (where the poll runs the whole time
      // behind SFSafariViewController). Kept generous so a slow connection or
      // device still lands an in-flight approval rather than false-cancelling.
      const graceMs = Platform.OS === "ios" ? 5000 : 12000;
      const outcome = await Promise.race([
        tokenPromise.then((token) => ({ kind: "token" as const, token })),
        browserClosed.then(async () => {
          const token = await Promise.race([
            safeToken,
            new Promise<string | null>((resolve) =>
              setTimeout(() => resolve(null), graceMs),
            ),
          ]);
          return { kind: "closed" as const, token };
        }),
      ]);
      controller.abort();
      try {
        WebBrowser.dismissBrowser();
      } catch {
        // no-op: nothing to dismiss
      }

      if (!outcome.token) {
        toast(
          outcome.kind === "closed"
            ? "Plex sign-in cancelled"
            : "Plex sign-in timed out — please try again",
          "error",
        );
        return;
      }
      await finishPlexConnect(outcome.token, clientId);
    } catch (e) {
      toastError("Plex sign-in failed", e);
    } finally {
      plexAbortRef.current = null;
      setConnecting(false);
    }
  };

  const performDelete = () => {
    flow.close();
    // The store write swaps this editor for the "not found" branch and
    // onDeleted unmounts it — both only after the confirm is fully gone.
    flow.whenClear(() => {
      void (async () => {
        if (serviceId === "qbittorrent") {
          await qbClearSession(instanceId);
        }
        await removeInstance(serviceId, instanceId);
        onDeleted();
      })();
    });
  };

  if (!inst) {
    // Edge case: instance was deleted while the editor was still mounted.
    return (
      <ScreenWrapper>
        <BackHeader title="Not found" onBack={onBack} />
        <Text className="text-zinc-400 text-sm">
          This instance no longer exists. Tap back to return.
        </Text>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <BackHeader
        title={config.name}
        onBack={handleBack}
        right={
          isDirty ? (
            <Text className="text-amber-400 text-xs">• unsaved</Text>
          ) : null
        }
      />

      <Card className="gap-4 mb-4">
        <TextInput
          label="Name"
          placeholder={SERVICE_DEFAULTS_KIND_LABEL[serviceId]}
          value={name}
          onChangeText={setName}
        />
        <Toggle
          label="Enabled"
          value={config.enabled}
          onValueChange={() => toggleInstance(serviceId, instanceId)}
        />
      </Card>

      <Card className="gap-4 mb-4">
        <TextInput
          label="Local URL"
          placeholder="http://192.168.1.100:8080"
          value={localUrl}
          onChangeText={setLocalUrl}
          onBlur={() => setLocalUrl(normalizeServiceUrl(localUrl))}
          keyboardType="url"
        />
        <TextInput
          label="Remote URL"
          placeholder="https://service.mydomain.com"
          value={remoteUrl}
          onChangeText={setRemoteUrl}
          onBlur={() => setRemoteUrl(normalizeServiceUrl(remoteUrl))}
          keyboardType="url"
        />
        <Toggle
          label="Always use Remote URL"
          description="Force the remote URL even when on a configured home network. Leave off to let auto-switch use the local URL at home."
          value={config.useRemote}
          onValueChange={(v) =>
            updateInstance(serviceId, instanceId, { useRemote: v })
          }
        />
        <Toggle
          label="Allow invalid certificates"
          description="Skip TLS certificate checks for this server, accepting self-signed or otherwise invalid certs. Only enable for servers you trust on a network you control."
          value={config.ignoreCertErrors ?? false}
          onValueChange={(v) =>
            updateInstance(serviceId, instanceId, { ignoreCertErrors: v })
          }
        />
      </Card>

      <Card className="gap-4 mb-4">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Authentication
        </Text>
        {serviceId === "plex" ? (
          <View className="gap-2">
            <Button
              label="Connect with Plex"
              onPress={() => void handleConnectPlex()}
              loading={connecting}
              icon={<Icon icon={LogIn} size={18} color="#fff" />}
            />
            <Text className="text-zinc-500 text-xs">
              Sign in to auto-fill this server&apos;s URLs and token, or enter a
              token manually below.
            </Text>
          </View>
        ) : null}
        {usesBasicAuth ? (
          <>
            <TextInput
              label="Username"
              placeholder="admin"
              value={username}
              onChangeText={setUsername}
            />
            <TextInput
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </>
        ) : (
          <TextInput
            label="API Key"
            placeholder="Enter API key"
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
          />
        )}
      </Card>

      <Card className="gap-4 mb-4">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Custom Headers
        </Text>
        <HeaderListEditor
          value={customHeaders}
          onChange={setCustomHeaders}
          helperText="Sent on every request to this instance. Combined with the global headers (Settings → Network → Custom Headers). The service's own auth (API Key, Plex Token, etc.) always wins on collision."
        />
      </Card>

      <ArrDefaultsCard serviceId={serviceId} instanceId={instanceId} />

      <InstanceNotificationsCard serviceId={serviceId} instanceId={instanceId} />

      <WebhookInstanceIdCard serviceId={serviceId} instanceId={instanceId} />

      <View className="flex-row gap-3 mb-4">
        <Button
          label="Test Connection"
          onPress={handleTest}
          variant="outline"
          loading={testing}
          className="flex-1"
        />
        <Button label="Save" onPress={handleSave} className="flex-1" />
      </View>

      {/* Delete is only offered when the user has more than one instance of this
          kind — kinds always carry at least one slot, so removing the only
          instance would leave the kind in an unpopulated state and force the
          user to re-create it. Better to let them disable instead. */}
      {instancesForKind.length > 1 ? (
        <Button
          label="Delete instance"
          onPress={() => flow.open("confirmDelete")}
          variant="outline"
        />
      ) : null}

      <ConfirmModal
        {...flow.bind("confirmDelete")}
        title="Delete instance"
        message={`This will remove "${config.name}" and its credentials. This cannot be undone.`}
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={performDelete}
      />

      <AddToDashboardsSheet
        visible={flow.isOpen("addToDashboards")}
        instanceId={instanceId}
        instanceName={config.name}
        onClose={() => {
          flow.close();
          // Unmounting the editor while the sheet is still tearing down is
          // the issue-#83 race — leave only once it reports fully gone.
          flow.whenClear(() => onBack());
        }}
        onClosed={flow.onClosed}
      />

      <ActionSheet
        {...flow.bind("unsaved")}
        title="Unsaved changes"
        subtitle="Your URL or credentials haven't been saved."
        actions={[
          {
            label: "Save",
            // "Save" can open the HTTP-warning modal — run it only once the
            // sheet has fully closed.
            onPress: () => flow.whenClear(() => void handleSave()),
          },
          {
            label: "Discard",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => flow.whenClear(() => onBack()),
          },
        ]}
      />

      <ConfirmModal
        {...flow.bind("httpWarning")}
        title="Remote URL uses HTTP"
        message={flow.payload("httpWarning")?.message ?? ""}
        tone="danger"
        confirmLabel="Save anyway"
        onConfirm={() => {
          const request = flow.payload("httpWarning");
          flow.close();
          // Resolving resumes handleSave, which may present the
          // AddToDashboards sheet or unmount the editor — wait until clear.
          flow.whenClear(() => request?.resolve(true));
        }}
        onCancel={() => {
          const request = flow.payload("httpWarning");
          flow.close();
          flow.whenClear(() => request?.resolve(false));
        }}
      />

      <ActionSheet
        {...flow.bind("serverPicker")}
        title="Choose your server"
        subtitle="Pick which Plex server this connects to."
        actions={(flow.payload("serverPicker") ?? []).map((server) => ({
          label: server.name,
          // Apply only once the sheet is fully dismissed — applyServer just sets
          // form state, but staying consistent with the flow's onClosed rule.
          onPress: () => flow.whenClear(() => applyServer(server)),
        }))}
      />
    </ScreenWrapper>
  );
}

// Per-instance notification overrides. For each notification category that
// applies to this kind (see CATEGORIES_FOR_KIND), a 3-option Select decides
// whether to defer to the global toggle or force on/off for this specific
// instance. Stored under notificationSettings.perInstance[instanceId].
function InstanceNotificationsCard({
  serviceId,
  instanceId,
}: {
  serviceId: ServiceId;
  instanceId: string;
}) {
  const notif = useConfigStore((s) => s.notificationSettings);
  const setOverride = useConfigStore((s) => s.setInstanceNotificationOverride);
  const categories = CATEGORIES_FOR_KIND[serviceId] ?? [];
  if (categories.length === 0) return null;

  const masterOff = !notif.enabled;
  const overrideMap = notif.perInstance?.[instanceId];

  return (
    <Card className="gap-4 mb-4" style={masterOff ? { opacity: 0.55 } : undefined}>
      <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
        Notifications
      </Text>
      {masterOff ? (
        <Text className="text-zinc-500 text-xs leading-5">
          Notifications are off. Turn them on in Settings → Notifications to
          use per-instance overrides.
        </Text>
      ) : null}
      {categories.map((cat) => {
        const override = overrideMap?.[cat];
        const value: "inherit" | "on" | "off" =
          override === undefined ? "inherit" : override ? "on" : "off";
        const globalOn = notif[cat];
        return (
          <Select
            key={cat}
            label={CATEGORY_LABELS[cat]}
            value={value}
            disabled={masterOff}
            options={[
              {
                value: "inherit",
                label: `Use default (${globalOn ? "On" : "Off"})`,
              },
              { value: "on", label: "Always notify" },
              { value: "off", label: "Never notify" },
            ]}
            onChange={(next) =>
              setOverride(
                instanceId,
                cat satisfies NotifCategory,
                next === "inherit" ? "inherit" : next === "on",
              )
            }
          />
        );
      })}
    </Card>
  );
}

/**
 * Read-only display of the instance UUID for webhook attribution. The user
 * appends `?instance=<id>` to the webhook URL they paste into Radarr/Sonarr/
 * etc., and the backend uses that to tag pushes with the instance name (e.g.
 * "Radarr Seedbox: Movie X downloaded"). Hidden for kinds without a webhook
 * integration, and hidden when no backend is paired (the id has no use
 * standalone).
 */
function WebhookInstanceIdCard({
  serviceId,
  instanceId,
}: {
  serviceId: ServiceId;
  instanceId: string;
}) {
  const backendUrl = useBackendStore((s) => s.url);

  if (!WEBHOOK_KINDS.has(serviceId)) return null;
  if (!backendUrl) return null;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(instanceId);
    brrrHaptic();
    toast("Instance ID copied", "success");
  };

  return (
    <Card className="gap-3 mb-4">
      <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
        Webhook Attribution
      </Text>
      <Text className="text-zinc-400 text-xs leading-5">
        Append <Text className="text-zinc-200">?instance=&lt;id&gt;</Text> to your
        backend webhook URL in this service's notification settings to tag pushes
        with this instance's name and apply its per-instance notification
        settings. Only needed when you run more than one instance of this service
        — with a single instance, both apply automatically.
      </Text>
      <Pressable
        onPress={() => void handleCopy()}
        className="flex-row items-center justify-between bg-surface-light rounded-xl p-3 active:opacity-70"
      >
        <Text
          className="text-zinc-200 text-xs flex-1 mr-3"
          numberOfLines={1}
          ellipsizeMode="middle"
          selectable
        >
          {instanceId}
        </Text>
        <Icon icon={Copy} size={16} color="#a1a1aa" />
      </Pressable>
    </Card>
  );
}
