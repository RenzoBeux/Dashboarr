import { View, Text } from "react-native";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useConfigStore } from "@/store/config-store";
import { useTargetInstance } from "@/hooks/use-instance-target";
import { useOverseerrUsers } from "@/hooks/use-overseerr";
import { useSeerrCapabilities } from "@/hooks/use-seerr-capabilities";
import { SeerrPermissionNotice } from "@/components/overseerr/seerr-permission-notice";
import type { ServiceId } from "@/lib/constants";

// Seerr user ids are auto-increment primary keys and always >= 1 (the original
// admin is 1), so a negative sentinel safely means "no stored default".
const API_KEY_OWNER_ID = -1;

/**
 * Per-instance "Request As" default for Seerr (#332).
 *
 * The problem it solves: a household shares one Seerr, the admin account exists
 * only for management, and everyone requests through a single regular account.
 * Dashboarr authenticates with the admin API key, so without this every request
 * from the app is attributed to the admin and the "who asked for this" column
 * in Seerr's own requests list is useless.
 *
 * Seerr supports this natively — `userId` on POST /request is what its own
 * "Request As" dropdown sends, permitted for callers holding BOTH MANAGE_USERS
 * and MANAGE_REQUESTS. The admin API key has both; an instance signed in as a
 * household member usually has neither, in which case this card says who the
 * requests are filed as instead of offering a picker Seerr would reject.
 * Renders nothing for other service kinds so the caller can drop it in
 * unconditionally.
 */
export function SeerrRequestUserCard({
  serviceId,
  instanceId,
}: {
  serviceId: ServiceId;
  instanceId: string;
}) {
  if (serviceId !== "overseerr") return null;
  return <RequestUserBody instanceId={instanceId} />;
}

function RequestUserBody({ instanceId }: { instanceId: string }) {
  const inst = useTargetInstance("overseerr", instanceId);
  const updateInstance = useConfigStore((s) => s.updateInstance);
  const caps = useSeerrCapabilities(instanceId);
  const { data, isLoading, isError } = useOverseerrUsers(
    instanceId,
    caps.loaded && caps.canRequestAs,
  );

  const users = data?.results ?? [];
  const stored = inst?.requestAsUserId;
  // A stored id that no longer matches a live account (user deleted in Seerr)
  // would otherwise render as an empty Select and then fail at request time
  // with a bare 500. Surface it as its own option so the state is visible and
  // the user can pick something valid.
  const isStale =
    stored !== undefined && users.length > 0 && !users.some((u) => u.id === stored);

  const header = (
    <View className="gap-1">
      <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
        Requests
      </Text>
      <Text className="text-zinc-500 text-xs">
        Who new requests from this app are attributed to in Seerr.
      </Text>
    </View>
  );

  // Signed in as an account that cannot request on behalf of others: this
  // doubles as the "signed in as" line for the instance.
  if (caps.loaded && !caps.canRequestAs) {
    return (
      <Card className="gap-4 mb-4">
        {header}
        <SeerrPermissionNotice
          message={`Requests from this app are filed as ${caps.displayName ?? "the signed-in account"}. Choosing another account needs the admin API key, or an account that can manage both users and requests.`}
        />
      </Card>
    );
  }

  return (
    <Card className="gap-4 mb-4">
      {header}

      <Select<number>
        label="Request As"
        value={stored ?? API_KEY_OWNER_ID}
        disabled={users.length === 0}
        options={[
          {
            value: API_KEY_OWNER_ID,
            label: caps.loaded && caps.displayName ? caps.displayName : "API key owner",
            description: "Attribute requests to this instance's own account (default)",
          },
          ...users.map((u) => ({
            value: u.id,
            label: u.displayName,
            description:
              u.requestCount !== undefined
                ? `${u.requestCount} request${u.requestCount === 1 ? "" : "s"}`
                : undefined,
          })),
          ...(isStale
            ? [
                {
                  value: stored,
                  label: `Unknown user (#${stored})`,
                  description: "This account no longer exists in Seerr",
                },
              ]
            : []),
        ]}
        onChange={(v) =>
          updateInstance("overseerr", instanceId, {
            requestAsUserId: v === API_KEY_OWNER_ID ? undefined : v,
          })
        }
      />

      {isError ? (
        <Text className="text-zinc-500 text-xs">
          Could not load accounts from Seerr. Save the connection above, then
          make sure this instance is enabled and reachable.
        </Text>
      ) : !isLoading && users.length === 0 ? (
        <Text className="text-zinc-500 text-xs">
          No accounts loaded yet. Save the connection above, then make sure this
          instance is enabled and reachable.
        </Text>
      ) : null}

      {stored !== undefined && !isStale ? (
        <Text className="text-zinc-500 text-xs">
          Seerr still decides approval from this instance&apos;s own
          permissions, not the chosen account&apos;s, so with the admin key
          these arrive already approved rather than pending.
        </Text>
      ) : null}
    </Card>
  );
}
