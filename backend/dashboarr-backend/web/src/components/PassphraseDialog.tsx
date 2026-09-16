import { useEffect, useRef, useState, type FormEvent } from "react";

const MIN_LENGTH = 8;

interface Props {
  open: boolean;
  /** "open" unlocks an existing backup; "create" chooses a passphrase for a new one. */
  mode: "open" | "create";
  title: string;
  description?: string;
  busy: boolean;
  error: string | null;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
}

/** Native <dialog>: free focus trap, Escape closes, backdrop styled in styles.css. */
export function PassphraseDialog({ open, mode, title, description, busy, error, onSubmit, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setPassphrase("");
      setConfirm("");
      setShow(false);
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  const mismatch = mode === "create" && confirm.length > 0 && confirm !== passphrase;
  const tooShort = passphrase.length > 0 && passphrase.length < MIN_LENGTH;
  const canSubmit = passphrase.length >= MIN_LENGTH && !busy && (mode === "open" || confirm === passphrase);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) onSubmit(passphrase);
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form className="dialog-body" onSubmit={submit}>
        <h2>{title}</h2>
        {description ? <p className="muted small">{description}</p> : null}
        <label className="field">
          <span>Passphrase</span>
          <span className="input-row">
            <input
              type={show ? "text" : "password"}
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              spellCheck={false}
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={busy}
            />
            <button type="button" className="secondary" onClick={() => setShow((v) => !v)} disabled={busy}>
              {show ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        {mode === "create" ? (
          <label className="field">
            <span>Confirm passphrase</span>
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              spellCheck={false}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </label>
        ) : null}
        {tooShort ? <p className="error small">At least {MIN_LENGTH} characters.</p> : null}
        {mismatch ? <p className="error small">The two passphrases differ.</p> : null}
        {error ? <p className="error small">{error}</p> : null}
        {mode === "create" ? (
          <p className="muted small">
            There is no recovery: forgetting this passphrase makes the backup unusable. Your phone will ask for it once to
            restore.
          </p>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}>
            {busy ? "Working…" : mode === "create" ? "Create" : "Unlock"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
