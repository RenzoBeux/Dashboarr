import { useState } from "react";
import type { ServiceId } from "@/lib/constants";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type { ExportPayload, ServiceInstance } from "@/lib/config-types";
import { SERVICE_CATALOG } from "@/lib/service-catalog";
import { SEERR_AUTH_MODES, SEERR_AUTH_MODE_LABELS, seerrAuthMode } from "@/lib/seerr-auth";
import type { SeerrAuthMode } from "@/lib/seerr-auth";
import { normalizeServiceUrl, validateServiceUrl } from "@/lib/url-validation";
import type { InstancePatch } from "../editor/reducer";

interface Props {
  kind: ServiceId;
  instance: ServiceInstance;
  secrets: ExportPayload["secrets"][string] | undefined;
  onChange: (patch: InstancePatch) => void;
  onSecrets: (patch: { apiKey?: string; username?: string; password?: string }) => void;
  onSeerrMode: (mode: SeerrAuthMode) => void;
  onRemove: () => void;
}

function SecretInput({
  label,
  value,
  autoComplete,
  onChange,
}: {
  label: string;
  value: string;
  autoComplete: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-row">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="secondary" onClick={() => setShow((v) => !v)}>
          {show ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}

function UrlInput({
  label,
  value,
  kindOfUrl,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  kindOfUrl: "local" | "remote";
  placeholder: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const check = validateServiceUrl(draft, kindOfUrl);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const normalized = normalizeServiceUrl(draft);
          setDraft(normalized);
          if (normalized !== value) onCommit(normalized);
        }}
      />
      {check.kind === "invalid" ? <span className="error small">{check.message}</span> : null}
      {check.kind === "warn" ? <span className="warning small">{check.message}</span> : null}
    </label>
  );
}

export function InstanceForm({ kind, instance, secrets, onChange, onSecrets, onSeerrMode, onRemove }: Props) {
  const entry = SERVICE_CATALOG[kind];
  const defaults = SERVICE_DEFAULTS[kind];
  const isSeerr = entry.signIn === "seerr";
  const mode = seerrAuthMode(instance);
  const showApiKey = isSeerr ? mode === "apiKey" || mode === "plex" : entry.authShape === "apiKey";
  const showUserPass = isSeerr ? mode === "mediaServer" || mode === "local" : entry.authShape !== "apiKey";
  const showUsername = showUserPass && (isSeerr || entry.authShape === "userPass");

  return (
    <div className="instance-form" key={instance.id}>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input type="text" autoComplete="off" value={instance.name} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <label className="field toggle">
          <input type="checkbox" checked={instance.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          <span>Enabled</span>
        </label>
      </div>
      <UrlInput
        label="Local URL"
        kindOfUrl="local"
        placeholder={`http://192.168.1.10:${defaults.defaultPort}`}
        value={instance.localUrl}
        onCommit={(v) => onChange({ localUrl: v })}
      />
      <UrlInput
        label="Remote URL (optional)"
        kindOfUrl="remote"
        placeholder={`https://${kind}.example.com`}
        value={instance.remoteUrl}
        onCommit={(v) => onChange({ remoteUrl: v })}
      />
      <p className="muted small">{defaults.name} usually listens on port {defaults.defaultPort}.</p>

      {isSeerr ? (
        <label className="field">
          <span>Sign-in mode</span>
          <select value={mode} onChange={(e) => onSeerrMode(e.target.value as SeerrAuthMode)}>
            {SEERR_AUTH_MODES.map((m) => (
              <option key={m} value={m}>
                {SEERR_AUTH_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showApiKey ? (
        <>
          <SecretInput
            label={isSeerr && mode === "plex" ? "Plex token" : entry.oauth === "plex" ? "Plex token" : "API key"}
            value={secrets?.apiKey ?? ""}
            autoComplete="off"
            onChange={(v) => onSecrets({ apiKey: v })}
          />
          {entry.apiKeyHint ? <p className="muted small">Where to find it: {entry.apiKeyHint}</p> : null}
        </>
      ) : null}
      {showUsername ? (
        <SecretInput
          label={isSeerr && mode === "local" ? "Email" : "Username"}
          value={secrets?.username ?? ""}
          autoComplete="off"
          onChange={(v) => onSecrets({ username: v })}
        />
      ) : null}
      {showUserPass ? (
        <SecretInput label="Password" value={secrets?.password ?? ""} autoComplete="new-password" onChange={(v) => onSecrets({ password: v })} />
      ) : null}

      <label className="field toggle">
        <input
          type="checkbox"
          checked={instance.ignoreCertErrors === true}
          onChange={(e) => onChange({ ignoreCertErrors: e.target.checked })}
        />
        <span>Allow invalid certificates (self-signed or private CA)</span>
      </label>

      <div className="form-actions">
        <button type="button" className="danger secondary" onClick={onRemove}>
          Remove instance
        </button>
      </div>
    </div>
  );
}
