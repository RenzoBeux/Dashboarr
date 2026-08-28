import { Lock } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * NZBHydra2 gates /api/stats, /api/stats/indexers and /api/history/* behind its
 * own `auth.allowApiStats` config flag (default on). With it off, all four
 * reject a perfectly valid API key while t=caps — and therefore searching and
 * the health dot — keep working. The raw 401/403 would read as "wrong API key"
 * and send the user off to re-paste a key that was never the problem, so name
 * the actual setting instead.
 *
 * Only rendered when a caps query has ALREADY succeeded, which proves the key
 * is good; anything else falls through to the normal ErrorBanner.
 */
export function Nzbhydra2ApiGate({ subject }: { subject: string }) {
  return (
    <EmptyState
      icon={<Icon icon={Lock} size={28} color="#f59e0b" />}
      title={`NZBHydra2 isn't sharing ${subject}`}
      message={
        "Its API stats access is switched off. Turn it back on in NZBHydra2 " +
        "under Config → Auth, then pull to refresh. Searching and " +
        "grabbing are unaffected."
      }
    />
  );
}
