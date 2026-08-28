import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Linking, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { toast, toastError } from "@/components/ui/toast";
import { Trash2, Copy, Layers } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Select } from "@/components/ui/select";
import { HeaderListEditor } from "@/components/ui/header-list-editor";
import { useConfigStore, type ServiceConfig } from "@/store/config-store";
import { useBackendStore } from "@/store/backend-store";
import { BackHeader } from "@/components/common/back-header";
import { testServiceConnection, lanGuardBlockReason } from "@/lib/http-client";
import { qbClearSession } from "@/services/qbittorrent-api";
import { delugeClearSession } from "@/services/deluge-api";
import { navidromeClearSession } from "@/services/navidrome-api";
import { piholeClearSession } from "@/services/pihole-api";
import { getPlexClientId } from "@/lib/plex-client-id";
import {
  requestPin,
  buildAuthUrl,
  pollPinForToken,
  discoverServers,
  type PlexServer,
} from "@/services/plex-auth";
import { SERVICE_DEFAULTS, type ServiceId } from "@/lib/constants";
import { SERVICE_CATALOG, secretsShapeFor } from "@/lib/service-catalog";
import { kindListRoute, isBlankInstance } from "@/lib/integration-status";
import {
  CATEGORIES_FOR_KIND,
  CATEGORY_LABELS,
  type NotifCategory,
} from "@/lib/notification-categories";
import {
  validateServiceUrl,
  normalizeServiceUrl,
  resolveActiveUrlKind,
  workspaceForcesRemote,
} from "@/lib/url-validation";
import { brrrHaptic } from "@/lib/haptics";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { ActionSheet } from "@/components/ui/action-sheet";
import { ArrDefaultsCard } from "@/components/settings/arr-defaults-card";
import { QbtMutedCategories } from "@/components/settings/qbt-muted-categories";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { AuthCard } from "@/components/integrations/auth-card";
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
  const addInstance = useConfigStore((s) => s.addInstance);

  // First-save dashboard prompt is offered exactly once per editor session,
  // after the user saves an instance whose initial state was unconfigured
  // (no URL, no credentials). `promptShown` keeps us from re-asking on
  // subsequent saves in the same session if the user already engaged with
  // (or skipped) the sheet.
  const [promptShown, setPromptShown] = useState(false);

  const config: ServiceConfig = inst ?? {
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
  const navigation = useNavigation();
  const allowRemoveRef = useRef(false);
  // The navigation action usePreventRemove intercepted, replayed verbatim once
  // the user resolves the unsaved sheet. Consumed once by leave(), so a sheet
  // the user cancelled can never replay its action on a later, unrelated save.
  // A ref, not state: Save flips the bypass and navigates in the same tick, and
  // a state flip would land after the navigation had already tripped the guard.
  const leaveActionRef = useRef<Parameters<
    typeof navigation.dispatch
  >[0] | null>(null);

  const flow = useModalFlow<{
    unsaved: void;
    confirmDelete: void;
    addToDashboards: void;
    httpWarning: { message: string; resolve: (ok: boolean) => void };
    serverPicker: PlexServer[];
  }>();

  // The credential form shape comes from the catalog rather than a chain of
  // `serviceId === "..."` comparisons, so a new service is a data entry.
  //
  // NOTE: this is the FORM shape, not SERVICE_DEFAULTS[id].httpAuth. qBittorrent
  // and Deluge take a username/password pair but authenticate against a login
  // endpoint and carry a session cookie rather than sending HTTP Basic, so the
  // two sets differ. See the warning on ServiceAuthShape in lib/service-catalog.ts.
  const catalogEntry = SERVICE_CATALOG[serviceId];
  const usesUserPass = secretsShapeFor(catalogEntry.authShape) === "userPass";
  // AuthCard owns the username/password vs API-key split; this component still
  // needs the shape for the dirty check, the configured snapshot and the write.
  const defaultPort = SERVICE_DEFAULTS[serviceId].defaultPort;
  const router = useRouter();

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
  const [wasInitiallyUnconfigured] = useState(() =>
    isBlankInstance(config, secrets, usesUserPass),
  );

  const isBlank = isBlankInstance(config, secrets, usesUserPass);

  // Live equivalent of the snapshot above. `handleAdd` writes the new instance
  // to the store before navigating here, so backing out of one you never filled
  // in used to leave a blank server sitting in the list. The first instance of
  // a kind never showed the bug because it reuses the seeded placeholder, which
  // is invisible until configured.
  const isBlankNewInstance = isNew && isBlank;

  // Removing the only instance of a kind is how you take an integration out of
  // your services entirely, so it has to be offered. There is nothing to remove
  // yet when that lone instance is still blank.
  const isLastInstance = instancesForKind.length === 1;
  const canRemove = !isLastInstance || !isBlank;
  const kindLabel = SERVICE_DEFAULTS_KIND_LABEL[serviceId];

  // Navigate first, then delete: removeInstance flips `inst` to undefined, so
  // deleting before the pop flashes the "Not found" branch. The store action
  // is not tied to this component and finishes after the unmount.
  const dropBlankNewInstance = () => {
    if (!isBlankNewInstance) return;
    void removeInstance(serviceId, instanceId);
  };

  const headersJson = JSON.stringify(customHeaders);
  const savedHeadersJson = JSON.stringify(secrets.customHeaders ?? {});

  const isDirty =
    name !== config.name ||
    localUrl !== config.localUrl ||
    remoteUrl !== config.remoteUrl ||
    headersJson !== savedHeadersJson ||
    (usesUserPass
      ? username !== (secrets.username ?? "") || password !== (secrets.password ?? "")
      : apiKey !== (secrets.apiKey ?? ""));

  // Unsaved-changes guard. usePreventRemove intercepts the Android hardware
  // back, the iOS edge swipe and our own header arrow through ONE code path,
  // and hands us the navigation action the user actually asked for so we can
  // replay it verbatim after they choose. This is the pattern already used by
  // app/dashboard-edit/[id].tsx and app/overseerr/customize-discover.tsx;
  // `beforeRemove` is not fully supported on native-stack.
  usePreventRemove(
    isDirty || isBlankNewInstance,
    useCallback(
      ({ data }) => {
        if (allowRemoveRef.current) {
          allowRemoveRef.current = false;
          navigation.dispatch(data.action);
          return;
        }
        // Abandoning an instance you just added and never filled in. Nothing
        // to save, so do not ask: drop the empty row and leave.
        if (!isDirty && isBlankNewInstance) {
          allowRemoveRef.current = true;
          navigation.dispatch(data.action);
          dropBlankNewInstance();
          return;
        }
        leaveActionRef.current = data.action;
        flow.open("unsaved");
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [navigation, flow, isDirty, isBlankNewInstance],
    ),
  );

  // Leave the editor, replaying the gesture the user actually made when there
  // was one. Callers that did not come from the guard (the Save button) null
  // the ref first, so they get a plain back instead of a stale action.
  const leave = () => {
    const action = leaveActionRef.current;
    leaveActionRef.current = null;
    allowRemoveRef.current = true;
    if (action) navigation.dispatch(action);
    else onBack();
  };

  const confirmHttpWarning = (message: string) =>
    new Promise<boolean>((resolve) => {
      flow.open("httpWarning", { message, resolve });
    });

  /**
   * "saved"    — persisted, caller should leave.
   * "prompted" — persisted, but the first-save AddToDashboards sheet is now
   *              queued. The caller must NOT queue a leave: a whenClear
   *              continuation supersedes a pending open, so doing so would
   *              silently swallow the sheet (lib/modal-flow.ts).
   * "aborted"  — validation failed or the user backed out; stay put.
   */
  const handleSave = async (): Promise<"saved" | "prompted" | "aborted"> => {
    if (!inst) return "aborted";
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Name cannot be empty", "error");
      return "aborted";
    }

    const normLocal = normalizeServiceUrl(localUrl);
    const normRemote = normalizeServiceUrl(remoteUrl);
    setLocalUrl(normLocal);
    setRemoteUrl(normRemote);

    const localResult = validateServiceUrl(normLocal, "local");
    if (localResult.kind === "invalid") {
      toast(localResult.message, "error");
      return "aborted";
    }
    const remoteResult = validateServiceUrl(normRemote, "remote");
    if (remoteResult.kind === "invalid") {
      toast(remoteResult.message, "error");
      return "aborted";
    }
    if (remoteResult.kind === "warn") {
      const confirmed = await confirmHttpWarning(remoteResult.message);
      if (!confirmed) return "aborted";
    }

    // Mirror the schema validator so the user can't save an invalid header
    // map and then have hydrate() silently drop it after a restart.
    const headerNameRe = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
    for (const [name, val] of Object.entries(customHeaders)) {
      if (!headerNameRe.test(name)) {
        toast(`Invalid header name: "${name}"`, "error");
        return "aborted";
      }
      if (/[\r\n]/.test(val)) {
        toast(`Header "${name}" value contains newlines`, "error");
        return "aborted";
      }
    }

    updateInstance(serviceId, instanceId, {
      name: trimmedName,
      localUrl: normLocal,
      remoteUrl: normRemote,
    });
    if (usesUserPass) {
      await updateInstanceSecrets(instanceId, {
        username,
        password,
        customHeaders,
      });
    } else {
      await updateInstanceSecrets(instanceId, { apiKey, customHeaders });
    }
    // Drop the cached session so the next request re-logs in with the new URL
    // or credentials. Only the session-bearing clients have one: glances,
    // nzbget, rtorrent and transmission reuse the same credential form but
    // authenticate per-request. Navidrome caches both a native-API JWT and the
    // Subsonic salt its token is derived from, so a password change must clear
    // it or every request keeps sending a token for the old password.
    if (serviceId === "qbittorrent") {
      await qbClearSession(instanceId);
    }
    if (serviceId === "deluge") {
      delugeClearSession(instanceId);
    }
    if (serviceId === "navidrome") {
      navidromeClearSession(instanceId);
    }
    // Pi-hole is awaited: piholeClearSession DELETEs /api/auth to hand the
    // session seat back. FTL allows only 16 at once with a 30-minute idle TTL,
    // so leaking one on every credential change is not free. This runs AFTER
    // updateInstanceSecrets, which is correct — the logout authenticates with
    // the SID, not the password.
    if (serviceId === "pihole") {
      await piholeClearSession(instanceId);
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
      const hasCreds = usesUserPass
        ? username.length > 0 || password.length > 0
        : apiKey.length > 0;
      if (hasUrl && hasCreds) {
        setPromptShown(true);
        flow.open("addToDashboards");
        return "prompted";
      }
    }

    return "saved";
  };

  const handleTest = async () => {
    setTesting(true);
    // Resolve which URL the app will actually use right now through the SAME
    // helper the health grid's L/R badge uses, so Test can never probe a
    // different slot than the dots (it used to re-derive the decision by hand
    // and missed both the workspace "always remote" pin and getActiveUrl's
    // remote→local fallback). We feed it the in-progress form values, not the
    // saved ones, so Test validates what the user typed before they Save.
    const {
      autoSwitchNetwork,
      networkAwayFromHome,
      dashboards,
      activeDashboardId,
      homeNetworks,
    } = useConfigStore.getState();
    const forcesRemote = workspaceForcesRemote(
      dashboards.find((d) => d.id === activeDashboardId) ?? dashboards[0],
      homeNetworks,
    );
    const which =
      resolveActiveUrlKind(
        { localUrl, remoteUrl, useRemote: config.useRemote },
        autoSwitchNetwork,
        networkAwayFromHome,
        forcesRemote,
      ) ??
      // Neither URL is set: nothing to resolve, so pick the slot whose
      // "you haven't configured this" message fits the current mode.
      (config.useRemote || forcesRemote || (autoSwitchNetwork && networkAwayFromHome)
        ? "remote"
        : "local");
    const useRemote = which === "remote";
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
      if (useRemote && !config.useRemote && forcesRemote) {
        toast(
          "This dashboard uses remote URLs only (its Home networks selection is empty), but none is set here. Add a remote URL, or pick its home networks in the dashboard's settings.",
          "error",
        );
      } else if (
        useRemote &&
        !config.useRemote &&
        autoSwitchNetwork &&
        networkAwayFromHome
      ) {
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
      // The URL answered, but the health probes may still be short-circuiting
      // it: Test always fires at what you typed, while the dots run the off-WiFi
      // LAN guard (#356). Say so, otherwise a green toast next to a red dot
      // reads as a contradiction with no explanation anywhere.
      const blocked = lanGuardBlockReason(testUrl, { remoteUrl });
      toast(
        blocked
          ? `Connected via ${which} URL in ${result.responseTime}ms. Dashboarr still shows it offline on this network: private LAN address off Wi-Fi (${blocked}).`
          : `Connected via ${which} URL in ${result.responseTime}ms`,
        blocked ? "info" : "success",
      );
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
    // Only after the confirm is fully gone (issue #83). Pop FIRST, then tear
    // down: removeInstance flips `inst` to undefined, so awaiting it before
    // leaving would flash the "Not found" branch under the pop animation.
    // The store action is not tied to this component and completes fine after
    // the unmount.
    flow.whenClear(() => {
      // The guard must not challenge a deletion — the instance is going away,
      // so there is nothing left to save.
      leaveActionRef.current = null;
      allowRemoveRef.current = true;
      onDeleted();
      void (async () => {
        if (serviceId === "qbittorrent") {
          await qbClearSession(instanceId);
        }
        if (serviceId === "navidrome") {
          navidromeClearSession(instanceId);
        }
        if (serviceId === "pihole") {
          await piholeClearSession(instanceId);
        }
        await removeInstance(serviceId, instanceId);
        // Every kind must keep at least one slot. Leaving the array empty
        // crashes the workspace editor, which reads list[0].id unguarded for
        // any kind it considers single-instance (app/dashboard-edit/[id].tsx).
        // A fresh blank placeholder also restores the kind to "not set up", so
        // it leaves Your services and reappears under Add a service.
        if (isLastInstance) {
          addInstance(serviceId, { name: kindLabel });
        }
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
        // No dirty check here on purpose: usePreventRemove intercepts this
        // pop exactly like the hardware back and the edge swipe.
        onBack={onBack}
        right={
          isDirty ? (
            <Text className="text-amber-400 text-xs">• unsaved</Text>
          ) : null
        }
      />

      {/* Enabled sits alone above everything, because it is the one switch in
          this screen that is neither a connection field nor a preference. */}
      <Card className="gap-4 mb-4">
        <Toggle
          label="Enabled"
          description="Show this instance in tabs and on dashboards."
          value={config.enabled}
          onValueChange={() => toggleInstance(serviceId, instanceId)}
        />
      </Card>

      {/* Everything from here to the Save button is deferred; everything after
          it writes immediately. The two labels make that rule visible instead
          of leaving the user to discover it one toggle at a time. */}
      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
        Connection
      </Text>

      <Card className="gap-4 mb-4">
        <TextInput
          label="Name"
          placeholder={SERVICE_DEFAULTS_KIND_LABEL[serviceId]}
          value={name}
          onChangeText={setName}
        />
      </Card>

      <Card className="gap-4 mb-4">
        <TextInput
          label="Local URL"
          placeholder={`http://192.168.1.100:${defaultPort}`}
          value={localUrl}
          onChangeText={setLocalUrl}
          onBlur={() => setLocalUrl(normalizeServiceUrl(localUrl))}
          keyboardType="url"
        />
        <View className="gap-1.5">
          <TextInput
            label="Remote URL"
            placeholder="https://service.mydomain.com"
            value={remoteUrl}
            onChangeText={setRemoteUrl}
            onBlur={() => setRemoteUrl(normalizeServiceUrl(remoteUrl))}
            keyboardType="url"
          />
          <Text className="text-zinc-600 text-xs">
            {SERVICE_DEFAULTS_KIND_LABEL[serviceId]} usually listens on port{" "}
            {defaultPort}.
          </Text>
        </View>
      </Card>

      <AuthCard
        entry={catalogEntry}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        username={username}
        onUsernameChange={setUsername}
        password={password}
        onPasswordChange={setPassword}
        onConnectPlex={() => void handleConnectPlex()}
        connecting={connecting}
      />

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

      <View className="flex-row gap-3 mb-4">
        <Button
          label="Test Connection"
          onPress={handleTest}
          variant="outline"
          loading={testing}
          className="flex-1"
        />
        <Button
          label="Save"
          onPress={() => {
            // Not a guard-intercepted gesture, so drop any action a cancelled
            // unsaved sheet left behind and just go back.
            leaveActionRef.current = null;
            void handleSave().then((outcome) => {
              // "prompted" leaves via the AddToDashboards sheet's onClose.
              if (outcome === "saved") leave();
            });
          }}
          className="flex-1"
        />
      </View>

      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1 ml-1">
        Preferences
      </Text>
      <Text className="text-zinc-600 text-xs mb-2 ml-1">
        Saved as you change them.
      </Text>

      {/* "Always use Remote URL" and "Allow invalid certificates" live BELOW
          the Save row rather than up with the URL fields, so the deferred /
          instant split is literally true. Deferring them is not an option:
          handleTest reads config.useRemote to pick which slot to probe (the
          #356 green-toast-next-to-red-dot contradiction), and ignoreCertErrors
          programs a native host allowlist derived from the SAVED instances
          (lib/insecure-tls.ts), so a deferred toggle would appear to do
          nothing until Save. */}
      <Card className="gap-4 mb-4">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Routing and security
        </Text>
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

      {serviceId === "qbittorrent" ? (
        <Card className="gap-4 mb-4">
          <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            Torrents
          </Text>
          <Toggle
            label='Tag added torrents with "Dashboarr"'
            description="Adds a Dashboarr tag to torrents you add from the app, so server-side scripts and filters can tell where they came from. The tag is created in qBittorrent on first use."
            value={config.tagAddedTorrents ?? false}
            onValueChange={(v) =>
              updateInstance(serviceId, instanceId, { tagAddedTorrents: v })
            }
          />
        </Card>
      ) : null}

      <ArrDefaultsCard serviceId={serviceId} instanceId={instanceId} />

      <InstanceNotificationsCard serviceId={serviceId} instanceId={instanceId} />

      <WebhookInstanceIdCard serviceId={serviceId} instanceId={instanceId} />

      {/* Always shown, including at one instance. A single-instance kind is
          routed straight here from the hub and from Browse, so this row is the
          only way to reach the list — and therefore the only way to add a
          second server of this kind. */}
      <SettingsGroup>
        <SettingsRow
          icon={Layers}
          label="Instances"
          subtitle={
            instancesForKind.length === 1
              ? `1 ${SERVICE_DEFAULTS_KIND_LABEL[serviceId]} server · add another`
              : `${instancesForKind.length} ${SERVICE_DEFAULTS_KIND_LABEL[serviceId]} servers`
          }
          onPress={() => router.push(kindListRoute(serviceId) as never)}
        />
      </SettingsGroup>

      {/* Offered for the last instance too: that is the only way to take an
          integration back out of your services once it is set up. Hidden only
          when the lone instance is still blank, since there is nothing to
          remove. */}
      {canRemove ? (
        <Button
          label={isLastInstance ? `Remove ${kindLabel}` : "Delete instance"}
          onPress={() => flow.open("confirmDelete")}
          variant="outline"
        />
      ) : null}

      <ConfirmModal
        {...flow.bind("confirmDelete")}
        title={isLastInstance ? `Remove ${kindLabel}` : "Delete instance"}
        message={
          isLastInstance
            ? `This will remove "${config.name}" and its credentials, and take ${kindLabel} out of your services. You can set it up again from Add a service.`
            : `This will remove "${config.name}" and its credentials. This cannot be undone.`
        }
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
          flow.whenClear(leave);
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
            // sheet has fully closed. Only queue the leave when the save did
            // not open the first-save sheet, or the continuation would
            // supersede that pending open and the sheet would never show.
            onPress: () =>
              flow.whenClear(() => {
                void handleSave().then((outcome) => {
                  if (outcome === "saved") flow.whenClear(leave);
                });
              }),
          },
          {
            label: "Discard",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () =>
              flow.whenClear(() => {
                leave();
                dropBlankNewInstance();
              }),
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
      {serviceId === "qbittorrent" ? (
        <QbtMutedCategories instanceId={instanceId} disabled={masterOff} />
      ) : null}
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
