import { useState, type FormEvent } from "react";
import { ApiError, login } from "../api";

interface Props {
  onSuccess: () => void;
}

export function Login({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setError(null);
    try {
      await login(password);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError("Wrong password.");
      else if (err instanceof ApiError && err.status === 429) setError("Too many attempts. Wait a minute and try again.");
      else if (err instanceof ApiError && err.status === 403) setError("The web UI is disabled on this backend.");
      else setError("Could not reach the backend.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="centered">
      <form className="card login" onSubmit={submit}>
        <h1>Dashboarr backend</h1>
        <p className="muted">Enter the web UI password to view the status page.</p>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
        />
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={pending || !password}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
