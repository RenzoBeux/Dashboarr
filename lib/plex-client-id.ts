import { getSecret, setSecret } from "@/store/storage";
import { generateInstanceId } from "@/lib/uuid";

// Plex ties a PIN → authToken → "Authorized Device" entry to the
// X-Plex-Client-Identifier sent on every plex.tv call. It MUST be stable across
// the PIN create, the poll, and the resources lookup (and ideally across app
// launches, so re-connecting doesn't spawn a new device entry each time). We
// persist one UUID in SecureStore — mirrors store/backend-store.ts's deviceId.
const PLEX_CLIENT_ID_KEY = "plex.clientId";

let cached: string | null = null;

export async function getPlexClientId(): Promise<string> {
  if (cached) return cached;
  const existing = await getSecret(PLEX_CLIENT_ID_KEY);
  if (existing && existing.length > 0) {
    cached = existing;
    return existing;
  }
  const fresh = generateInstanceId();
  await setSecret(PLEX_CLIENT_ID_KEY, fresh);
  cached = fresh;
  return fresh;
}
