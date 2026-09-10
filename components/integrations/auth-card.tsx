import type { ReactNode } from "react";
import { View, Text } from "react-native";
import { LogIn } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Select } from "@/components/ui/select";
import {
  secretsShapeFor,
  type ServiceCatalogEntry,
} from "@/lib/service-catalog";
import { SEERR_AUTH_MODE_LABELS, type SeerrAuthMode } from "@/lib/seerr-auth";

const SEERR_MODE_DESCRIPTIONS: Record<SeerrAuthMode, string> = {
  apiKey: "Full access with the admin key",
  plex: "Your own Plex account, via plex.tv",
  mediaServer: "Your Jellyfin or Emby username and password",
  local: "The email and password set in Seerr",
};

/**
 * The credential form for one instance.
 *
 * Which fields render is decided by the catalog entry, not by a chain of
 * `serviceId === "..."` comparisons. `oauth` is additive: Plex shows the
 * Connect button AND the API-key field, because the PIN flow writes into the
 * same secret the field edits and not everyone can complete a browser flow.
 *
 * `signIn` (#332) is additive too. When the editor passes `signInMode`, the
 * catalog's `authShape` still decides the stored shape (apiKey), but the
 * fields follow the chosen mode: a Plex sign-in button, Jellyfin/Emby
 * username + password, Seerr email + password, or the admin key. The modes
 * reuse the same four secret slots, which is what keeps every other caller of
 * `secretsShapeFor` untouched.
 */
export function AuthCard({
  entry,
  apiKey,
  onApiKeyChange,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  onConnectPlex,
  connecting,
  signInMode,
  signInModes,
  onSignInModeChange,
}: {
  entry: ServiceCatalogEntry;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  username: string;
  onUsernameChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  onConnectPlex: () => void;
  connecting: boolean;
  /** Seerr only: the sign-in mode the fields below belong to. */
  signInMode?: SeerrAuthMode;
  /** Seerr only: the modes this server offers (always includes the current). */
  signInModes?: SeerrAuthMode[];
  onSignInModeChange?: (mode: SeerrAuthMode) => void;
}) {
  const usesUserPass = secretsShapeFor(entry.authShape) === "userPass";
  const usesPasswordOnly = entry.authShape === "passwordOnly";

  const hint = entry.apiKeyHint ? (
    <Text className="text-zinc-600 text-xs">Find it in {entry.apiKeyHint}</Text>
  ) : null;

  let fields: ReactNode;
  if (signInMode === "plex") {
    fields = (
      <View className="gap-2">
        <Button
          label={apiKey ? "Sign in with Plex again" : "Sign in with Plex"}
          onPress={onConnectPlex}
          loading={connecting}
          icon={<Icon icon={LogIn} size={18} color="#fff" />}
        />
        <Text className="text-zinc-500 text-xs">
          {apiKey
            ? "Signed in. Seerr will see requests from this Plex account. The token is stored on this device only."
            : "Approve Dashboarr on plex.tv. Your Plex account must already have access to the media server in Seerr."}
        </Text>
      </View>
    );
  } else if (signInMode === "local" || signInMode === "mediaServer") {
    const isLocal = signInMode === "local";
    fields = (
      <View className="gap-1.5">
        <TextInput
          label={isLocal ? "Email" : "Username"}
          placeholder={isLocal ? "you@example.com" : "username"}
          value={username}
          onChangeText={onUsernameChange}
          keyboardType={isLocal ? "email-address" : "default"}
          textContentType={isLocal ? "emailAddress" : "username"}
        />
        <TextInput
          label="Password"
          placeholder="••••••••"
          value={password}
          onChangeText={onPasswordChange}
          secureTextEntry
          revealable
          textContentType="password"
        />
        <Text className="text-zinc-600 text-xs">
          {isLocal
            ? "The password set for your account in Seerr, not your media server password."
            : "The same username and password you use to sign in to Jellyfin or Emby."}
        </Text>
      </View>
    );
  } else if (usesUserPass) {
    fields = (
      <View className="gap-1.5">
        {usesPasswordOnly ? null : (
          <TextInput
            label="Username"
            placeholder="admin"
            value={username}
            onChangeText={onUsernameChange}
          />
        )}
        <TextInput
          label="Password"
          placeholder="••••••••"
          value={password}
          onChangeText={onPasswordChange}
          secureTextEntry
          revealable
        />
        {/* The hint used to render only in the apiKey branch below, leaving
            password services with no guidance at all — and those are exactly
            the ones where the right credential is not obvious (Pi-hole wants
            an application password, not the web password). */}
        {hint}
      </View>
    );
  } else {
    fields = (
      <View className="gap-1.5">
        <TextInput
          label="API Key"
          placeholder="Enter API key"
          value={apiKey}
          onChangeText={onApiKeyChange}
          secureTextEntry
          revealable
        />
        {hint}
      </View>
    );
  }

  return (
    <Card className="gap-4 mb-4">
      <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
        Authentication
      </Text>

      {signInMode && signInModes && onSignInModeChange ? (
        <Select<SeerrAuthMode>
          label="Sign in with"
          value={signInMode}
          options={signInModes.map((mode) => ({
            value: mode,
            label: SEERR_AUTH_MODE_LABELS[mode],
            description: SEERR_MODE_DESCRIPTIONS[mode],
          }))}
          onChange={onSignInModeChange}
        />
      ) : null}

      {entry.oauth === "plex" ? (
        <View className="gap-2">
          <Button
            label="Connect with Plex"
            onPress={onConnectPlex}
            loading={connecting}
            icon={<Icon icon={LogIn} size={18} color="#fff" />}
          />
          <Text className="text-zinc-500 text-xs">
            Sign in to auto-fill this server&apos;s URLs and token, or enter a
            token manually below.
          </Text>
        </View>
      ) : null}

      {fields}
    </Card>
  );
}
