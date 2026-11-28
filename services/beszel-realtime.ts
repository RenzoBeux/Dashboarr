import { buildUrl, resolveReachableUrl } from "@/lib/http-client";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { demoBeszelRealtimeMessage } from "@/lib/demo-data";
import { beszelRealtimeTopic, realtimeBackoffMs } from "@/lib/beszel-realtime";
import { createSseParser, type SseEvent } from "@/lib/sse-parser";
import { BeszelAuthError, beszelUserToken, resolveBeszelInstanceId } from "@/services/beszel-api";
import { useConfigStore } from "@/store/config-store";

export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "forbidden";

interface OpenOptions {
  systemId: string;
  instanceId?: string;
  onData: (data: unknown) => void;
  onStatus: (status: RealtimeStatus) => void;
  /** Test seam; defaults to React Native's XMLHttpRequest. */
  xhrFactory?: () => XMLHttpRequest;
}

const API_BASE = SERVICE_DEFAULTS.beszel.apiBasePath;
const DEMO_INTERVAL_MS = 1000;
// RN's XHR keeps the whole stream in responseText; at ~1 message a second a
// long Live session would grow without bound, so start a fresh stream past this.
const RECYCLE_AFTER_CHARS = 2 * 1024 * 1024;

/**
 * Subscribes to the hub's 1-second `rt_metrics` stream for one system, the
 * way the PocketBase JS SDK does (GET /api/realtime event stream → PB_CONNECT
 * carries the client id → POST /api/realtime with the subscription). Returns
 * a close function; closing ends the stream, which lets the hub stop polling
 * the agent.
 *
 * Built on React Native's XMLHttpRequest (progress events expose the growing
 * responseText) rather than expo/fetch streaming, so the request goes through
 * the same native networking stack as every other call: custom headers and the
 * per-instance "ignore certificate errors" bypass (lib/insecure-tls.ts) apply.
 */
export function openBeszelRealtime(opts: OpenOptions): () => void {
  const { systemId, onData, onStatus } = opts;
  const store = useConfigStore.getState();

  if (store.demoMode) {
    onStatus("live");
    const emit = () => onData(demoBeszelRealtimeMessage(systemId));
    emit();
    const timer = setInterval(emit, DEMO_INTERVAL_MS);
    return () => clearInterval(timer);
  }

  const id = resolveBeszelInstanceId(opts.instanceId);
  const topic = beszelRealtimeTopic(systemId);
  const makeXhr = opts.xhrFactory ?? (() => new XMLHttpRequest());
  let current: XMLHttpRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let stopped = false;

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    current?.abort();
    current = null;
  }

  function drop(xhr: XMLHttpRequest) {
    if (stopped || xhr !== current) return; // stale request, or already handled
    xhr.abort();
    current = null;
    onStatus("reconnecting");
    timer = setTimeout(connect, realtimeBackoffMs(attempt++));
  }

  function headersFor(): Record<string, string> {
    return useConfigStore.getState().getMergedHeaders("beszel", id);
  }

  async function subscribe(xhr: XMLHttpRequest, clientId: string) {
    try {
      const token = await beszelUserToken(id);
      if (stopped || xhr !== current) return;
      const baseUrl = resolveReachableUrl("beszel", id);
      if (!baseUrl) throw new Error("No URL configured for Beszel");
      const headers = new Headers();
      for (const [k, v] of Object.entries(headersFor())) headers.set(k, v);
      headers.set("Content-Type", "application/json");
      headers.set("Authorization", token);
      const res = await fetch(buildUrl(baseUrl, API_BASE, "/realtime"), {
        method: "POST",
        headers,
        body: JSON.stringify({ clientId, subscriptions: [topic] }),
      });
      if (stopped || xhr !== current) return;
      // The hub answers 404 when the account isn't a user of this system.
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        stop();
        onStatus("forbidden");
        return;
      }
      if (!res.ok) return drop(xhr);
      onStatus("live");
    } catch (err) {
      if (err instanceof BeszelAuthError) {
        stop();
        onStatus("forbidden");
        return;
      }
      drop(xhr);
    }
  }

  function connect() {
    timer = null;
    if (stopped) return;
    const baseUrl = resolveReachableUrl("beszel", id);
    if (!baseUrl) {
      onStatus("reconnecting");
      timer = setTimeout(connect, realtimeBackoffMs(attempt++));
      return;
    }
    const xhr = makeXhr();
    current = xhr;
    let seen = 0;
    const parser = createSseParser((e: SseEvent) => {
      if (xhr !== current) return;
      if (e.event === "PB_CONNECT") {
        let clientId = e.id ?? "";
        if (!clientId) {
          try {
            clientId = (JSON.parse(e.data) as { clientId?: string }).clientId ?? "";
          } catch {
            /* fall through to drop */
          }
        }
        if (!clientId) return drop(xhr);
        void subscribe(xhr, clientId);
      } else if (e.event === topic) {
        attempt = 0;
        try {
          onData(JSON.parse(e.data));
        } catch {
          /* skip a malformed frame */
        }
      }
    });
    xhr.open("GET", buildUrl(baseUrl, API_BASE, "/realtime"));
    for (const [k, v] of Object.entries(headersFor())) xhr.setRequestHeader(k, v);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");
    xhr.onprogress = () => {
      const text = xhr.responseText;
      if (text.length > seen) {
        parser.push(text.slice(seen));
        seen = text.length;
      }
      if (seen > RECYCLE_AFTER_CHARS && xhr === current) {
        xhr.abort();
        current = null;
        connect();
      }
    };
    // The event stream never completes on its own: load means the server closed it.
    xhr.onload = () => drop(xhr);
    xhr.onerror = () => drop(xhr);
    xhr.ontimeout = () => drop(xhr);
    xhr.send();
  }

  onStatus("connecting");
  connect();
  return stop;
}
