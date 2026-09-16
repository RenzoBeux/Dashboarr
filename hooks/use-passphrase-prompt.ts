import { useState } from "react";
import type { ExportStage, ImportStage } from "@/store/config-store";
import type { PassphraseMode, PassphraseResult } from "@/components/common/passphrase-prompt";
import {
  forgetRememberedPassphrase,
  hasRememberedPassphrase,
  loadRememberedPassphrase,
  saveRememberedPassphrase,
} from "@/lib/config-passphrase";

/**
 * The `PassphrasePrompt` wiring shared by the Backup screen (file export /
 * import) and the Backend screen (backend backup enable / restore, Refs #385).
 *
 * The flow step itself is declared by the screen — it owns the `useModalFlow`
 * — so the prompt is opened through the `open` callback the screen passes in.
 * `requestPassphrase` resolves only after the prompt is fully dismissed
 * (the screen resolves inside `flow.whenClear`), so whatever follows never
 * presents mid-dismiss.
 */
export interface PassphraseRequest {
  mode: PassphraseMode;
  resolve: (value: PassphraseResult | null) => void;
}

export function usePassphrasePrompt(open: (request: PassphraseRequest) => void) {
  const [hasRemembered, setHasRemembered] = useState(() => hasRememberedPassphrase());

  const requestPassphrase = (mode: PassphraseMode) =>
    new Promise<PassphraseResult | null>((resolve) => {
      open({ mode, resolve });
    });

  // After a successful op, reflect the user's "Remember" choice to the
  // Keychain/Keystore-backed store (save, or forget if they turned it off).
  const syncRememberedState = async (result: PassphraseResult) => {
    if (result.remember) {
      await saveRememberedPassphrase(result.passphrase);
      setHasRemembered(true);
    } else if (hasRemembered) {
      await forgetRememberedPassphrase();
      setHasRemembered(false);
    }
  };

  const useRemembered = async () => {
    const saved = await loadRememberedPassphrase();
    if (!saved) setHasRemembered(false);
    return saved;
  };

  return { hasRemembered, requestPassphrase, syncRememberedState, useRemembered };
}

export const EXPORT_STAGE_COPY: Record<ExportStage, { title: string; subtitle?: string }> = {
  preparing: { title: "Preparing backup…" },
  encrypting: {
    title: "Encrypting…",
    subtitle: "Deriving a key from your passphrase. This takes a moment on mobile.",
  },
  finalizing: { title: "Almost done…" },
};

export const IMPORT_STAGE_COPY: Record<ImportStage, { title: string; subtitle?: string }> = {
  downloading: { title: "Downloading backup…" },
  decrypting: {
    title: "Decrypting…",
    subtitle: "Deriving a key from your passphrase. This takes a moment on mobile.",
  },
  restoring: { title: "Restoring settings…" },
};
