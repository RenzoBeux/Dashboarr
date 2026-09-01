import { View, Text } from "react-native";
import { LogIn } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { secretsShapeFor, type ServiceCatalogEntry } from "@/lib/service-catalog";

/**
 * The credential form for one instance.
 *
 * Which fields render is decided by the catalog entry, not by a chain of
 * `serviceId === "..."` comparisons. `oauth` is additive: Plex shows the
 * Connect button AND the API-key field, because the PIN flow writes into the
 * same secret the field edits and not everyone can complete a browser flow.
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
}) {
  const usesUserPass = secretsShapeFor(entry.authShape) === "userPass";
  const usesPasswordOnly = entry.authShape === "passwordOnly";

  return (
    <Card className="gap-4 mb-4">
      <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
        Authentication
      </Text>

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

      {usesUserPass ? (
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
          />
          {/* The hint used to render only in the apiKey branch below, leaving
              password services with no guidance at all — and those are exactly
              the ones where the right credential is not obvious (Pi-hole wants
              an application password, not the web password). */}
          {entry.apiKeyHint ? (
            <Text className="text-zinc-600 text-xs">
              Find it in {entry.apiKeyHint}
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="gap-1.5">
          <TextInput
            label="API Key"
            placeholder="Enter API key"
            value={apiKey}
            onChangeText={onApiKeyChange}
            secureTextEntry
          />
          {entry.apiKeyHint ? (
            <Text className="text-zinc-600 text-xs">
              Find it in {entry.apiKeyHint}
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}
