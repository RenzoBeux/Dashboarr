import * as LocalAuthentication from "expo-local-authentication";

/**
 * Device auth gate shared by config export and backend backup enablement.
 *
 * A bystander with a momentarily-unlocked phone must not be able to dump
 * every API key by exporting (or by turning on a continuous encrypted export)
 * with a passphrase they chose. Skipped only when the device has no lock at
 * all — there is no security boundary to enforce then.
 *
 * Resolves "cancelled" when the user backs out; throws on a hard failure so
 * the caller surfaces it as an error rather than silently continuing.
 */
export async function requireDeviceAuth(promptMessage: string): Promise<"ok" | "cancelled"> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) return "ok";
  const auth = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: "Use passcode",
  });
  if (auth.success) return "ok";
  if (
    "error" in auth &&
    (auth.error === "user_cancel" || auth.error === "app_cancel" || auth.error === "system_cancel")
  ) {
    return "cancelled";
  }
  const reason = "error" in auth ? auth.error : "failed";
  throw new Error(`Device authentication ${reason}`);
}
