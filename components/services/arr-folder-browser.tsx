import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ChevronRight,
  Folder,
  FolderRoot,
  FolderSearch,
  FolderUp,
  HardDrive,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TextInput } from "@/components/ui/text-input";
import { ErrorBanner } from "@/components/common/error-banner";
import { useRefreshSpinner } from "@/components/common/pull-to-refresh";
import { ImportHint } from "@/components/services/manual-import-view";
import {
  manualImportServiceName,
  useArrFolderListing,
  useArrRootFolders,
} from "@/hooks/use-manual-import";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useAppTheme } from "@/hooks/use-app-theme";
import {
  containsPath,
  isScannableFolder,
  samePath,
  withTrailingSeparator,
} from "@/lib/arr-filesystem";
import type { ManualImportService } from "@/lib/manual-import";
import { formatBytes } from "@/lib/utils";
import { lightHaptic } from "@/lib/haptics";

interface ArrFolderBrowserProps {
  service: ManualImportService;
  instanceId?: string;
}

interface BrowserRow {
  key: string;
  icon: React.ComponentType<any>;
  label: string;
  detail?: string;
  /** Where tapping goes: a server path, "" for the server root, null for the start view. */
  target: string | null;
}

function upRow(up: string | null): BrowserRow {
  return {
    key: "up",
    icon: FolderUp,
    label: "Up",
    detail: up === null ? "Root folders" : up === "" ? "Server" : up,
    target: up,
  };
}

/**
 * "Import from folder" (#470): pick a folder on the Radarr/Sonarr host, then
 * review its files on the manual-import screen. For files copied onto the
 * server by hand, which *arr never downloaded and so never imports by itself.
 *
 * Starts at the instance's root folders plus the server root, browses with
 * the paths the server hands back (never joined here, see
 * lib/arr-filesystem.ts), and takes a typed path for anything else. Up from
 * the top of the server returns to the root-folder list.
 */
export function ArrFolderBrowser({ service, instanceId }: ArrFolderBrowserProps) {
  const router = useRouter();
  const tc = useThemeColor();
  const theme = useAppTheme();
  const serviceName = manualImportServiceName(service);

  // null = the start view (root folders); "" = the server root / drive list.
  const [path, setPath] = useState<string | null>(null);
  // The path field mirrors the folder on screen, and can be edited to jump.
  const [typed, setTyped] = useState("");

  const rootFolders = useArrRootFolders(service, instanceId);
  const listing = useArrFolderListing(service, path, instanceId);

  const { refreshing, onRefresh } = useRefreshSpinner(() =>
    path === null ? rootFolders.refetch() : listing.refetch(),
  );

  function go(target: string | null) {
    lightHaptic();
    setPath(target);
    setTyped(target ?? "");
  }

  function goTyped() {
    const next = withTrailingSeparator(typed);
    go(next === "" ? null : next);
  }

  const rows = useMemo<BrowserRow[]>(() => {
    if (path === null) {
      return [
        ...(rootFolders.data ?? []).map((folder) => ({
          key: `root:${folder.path}`,
          icon: FolderRoot,
          label: folder.path,
          detail: `${formatBytes(folder.freeSpace)} free`,
          target: withTrailingSeparator(folder.path),
        })),
        {
          key: "server",
          icon: HardDrive,
          label: "Browse server",
          detail: `Every folder ${serviceName} can see`,
          target: "",
        },
      ];
    }
    const data = listing.data;
    // A folder that failed to load still needs a way back out.
    if (!data) return listing.isError ? [upRow(null)] : [];
    return [
      upRow(data.up),
      ...data.folders.map((folder) => ({
        key: folder.path,
        icon: folder.isDrive ? HardDrive : Folder,
        label: folder.name,
        target: folder.path,
      })),
    ];
  }, [path, rootFolders.data, listing.data, listing.isError, serviceName]);

  const loading = path === null ? rootFolders.isLoading : listing.isLoading;
  const error = path === null ? rootFolders.error : listing.error;

  // The field can be edited without pressing Go, so Scan reads what it shows:
  // a typed path wins over the folder last opened.
  const typedPath = withTrailingSeparator(typed);
  const scanTarget =
    typedPath && !samePath(typedPath, path ?? "") ? typedPath : path;

  // Scanning a whole library folder, or a folder above one, walks and parses
  // every file in it, which the 90s scan timeout may not survive, and is
  // rarely what the user means.
  const coveredRoots = isScannableFolder(scanTarget)
    ? (rootFolders.data ?? []).filter((folder) =>
        containsPath(scanTarget, folder.path),
      )
    : [];
  const isRootFolder = coveredRoots.some((folder) =>
    samePath(folder.path, scanTarget ?? ""),
  );
  const noun = service === "sonarr" ? "series" : "movie";
  const rootHint =
    coveredRoots.length === 0
      ? null
      : `${
          isRootFolder
            ? "This is a root folder"
            : coveredRoots.length === 1
              ? `This folder holds the root folder ${coveredRoots[0].path}`
              : `This folder holds ${coveredRoots.length} root folders`
        }, so a scan reads every ${noun} in it and can take a long time. For files copied into a ${noun}'s own folder, use Rescan folder on its page instead.`;

  function scan() {
    if (!isScannableFolder(scanTarget)) return;
    // Open the typed folder too, so coming back lands where the scan ran.
    if (scanTarget !== path) go(scanTarget);
    router.push({
      pathname: "/manual-import",
      params: { service, folder: scanTarget, ...(instanceId ? { instanceId } : {}) },
    });
  }

  return (
    <>
      {/* Above the list, so the keyboard can never cover it. */}
      <TextInput
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={goTyped}
        placeholder="Type a server path, e.g. /downloads/manual"
        placeholderTextColor={tc("#71717a")}
        returnKeyType="go"
        autoCapitalize="none"
        autoCorrect={false}
        containerClassName="mb-3"
      />

      <FlatList
        className="flex-1"
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-4"
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          error || rootHint ? (
            <View className="gap-2 mb-2">
              {error ? (
                <ErrorBanner
                  error={error}
                  title={
                    path === null
                      ? `${serviceName} couldn't list its root folders`
                      : `${serviceName} couldn't open this folder`
                  }
                />
              ) : null}
              {rootHint ? <ImportHint text={rootHint} /> : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => go(item.target)}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 active:opacity-70"
          >
            <Icon icon={item.icon} size={18} color="#a1a1aa" />
            <View className="flex-1">
              <Text className="text-zinc-100 text-sm font-semibold" numberOfLines={2}>
                {item.label}
              </Text>
              {item.detail ? (
                <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                  {item.detail}
                </Text>
              ) : null}
            </View>
            <Icon icon={ChevronRight} size={16} color="#52525b" />
          </Pressable>
        )}
        ListFooterComponent={
          loading ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={tc("#a1a1aa")} />
            </View>
          ) : path !== null && listing.data?.folders.length === 0 && !error ? (
            <EmptyState
              className="mt-2"
              icon={<Icon icon={Folder} size={24} color="#71717a" />}
              title="No folders here"
              message="It has no subfolders, or it doesn't exist on the server. Its files can still be scanned."
            />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={["#3b82f6"]}
            progressBackgroundColor={theme.surface}
          />
        }
      />

      <View className="pt-3">
        <Button
          label="Scan this folder"
          size="lg"
          icon={<Icon icon={FolderSearch} size={18} color="#ffffff" />}
          disabled={!isScannableFolder(scanTarget)}
          onPress={scan}
        />
      </View>
    </>
  );
}
