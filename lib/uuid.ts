import * as Crypto from "expo-crypto";
import { generateInstanceId, setInstanceIdGenerator } from "@/lib/instance-id";

// The app-side binding of lib/instance-id: prefer expo-crypto's native UUID
// when its module is present (every real build), and let the pure module fall
// through to its own generators otherwise (Jest, and the web editor, which
// never imports this file).
setInstanceIdGenerator(() => {
  try {
    const native = Crypto.randomUUID?.();
    return typeof native === "string" ? native : "";
  } catch {
    return "";
  }
});

export { generateInstanceId };
