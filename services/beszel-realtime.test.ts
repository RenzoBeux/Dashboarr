jest.mock("@/store/config-store", () => ({
  useConfigStore: { getState: jest.fn() },
}));

import { useConfigStore } from "@/store/config-store";
import { beszelRealtimeTopic } from "@/lib/beszel-realtime";
import { openBeszelRealtime, type RealtimeStatus } from "@/services/beszel-realtime";

const mockGetState = useConfigStore.getState as jest.Mock;
const INSTANCE = "inst-1";
const BASE_URL = "http://beszel.local:8090";
const TOPIC = beszelRealtimeTopic("sys-1");

function setStore(overrides: Record<string, unknown> = {}) {
  mockGetState.mockReturnValue({
    demoMode: false,
    getActiveInstanceId: () => INSTANCE,
    instanceSecrets: { [INSTANCE]: { username: "admin", password: "hunter2" } },
    getActiveUrl: () => BASE_URL,
    getInstance: () => ({ id: INSTANCE, enabled: true, name: "Beszel", localUrl: BASE_URL, remoteUrl: "", useRemote: false }),
    getMergedHeaders: () => ({ "X-Proxy": "1" }),
    ...overrides,
  });
}

class FakeXhr {
  static instances: FakeXhr[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  responseText = "";
  aborted = false;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send() {}
  abort() {
    this.aborted = true;
  }
  emit(text: string) {
    this.responseText += text;
    this.onprogress?.();
  }
}

type Call = { url: string; init: RequestInit };
let calls: Call[];
let subscribeStatus: number;

function mockFetch() {
  calls = [];
  global.fetch = jest.fn((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes("auth-with-password")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ token: "tok-user" }) } as Response);
    }
    return Promise.resolve({
      ok: subscribeStatus < 300,
      status: subscribeStatus,
      json: async () => ({}),
      text: async () => "",
    } as Response);
  }) as unknown as typeof fetch;
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function open() {
  const data: unknown[] = [];
  const statuses: RealtimeStatus[] = [];
  const close = openBeszelRealtime({
    systemId: "sys-1",
    instanceId: INSTANCE,
    onData: (d) => data.push(d),
    onStatus: (s) => statuses.push(s),
    xhrFactory: () => new FakeXhr() as unknown as XMLHttpRequest,
  });
  return { data, statuses, close };
}

beforeEach(() => {
  jest.useFakeTimers();
  FakeXhr.instances = [];
  subscribeStatus = 204;
  setStore();
  mockFetch();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("openBeszelRealtime", () => {
  it("opens the event stream with the instance's custom headers", () => {
    open();
    const xhr = FakeXhr.instances[0];
    expect(xhr.method).toBe("GET");
    expect(xhr.url).toBe(`${BASE_URL}/api/realtime`);
    expect(xhr.headers["X-Proxy"]).toBe("1");
    expect(xhr.headers.Accept).toBe("text/event-stream");
  });

  it("subscribes with a users token after PB_CONNECT, then reports live", async () => {
    const { statuses } = open();
    FakeXhr.instances[0].emit('id: cid-1\nevent: PB_CONNECT\ndata: {"clientId":"cid-1"}\n\n');
    await flush();
    expect(calls[0].url).toContain("/api/collections/users/auth-with-password");
    const sub = calls[1];
    expect(sub.url).toBe(`${BASE_URL}/api/realtime`);
    expect(sub.init.method).toBe("POST");
    expect(JSON.parse(sub.init.body as string)).toEqual({ clientId: "cid-1", subscriptions: [TOPIC] });
    expect((sub.init.headers as Headers).get("Authorization")).toBe("tok-user");
    expect(statuses).toEqual(["connecting", "live"]);
  });

  it("delivers rt_metrics messages and ignores other events", async () => {
    const { data } = open();
    const xhr = FakeXhr.instances[0];
    xhr.emit('id: cid-1\nevent: PB_CONNECT\ndata: {"clientId":"cid-1"}\n\n');
    await flush();
    xhr.emit(`event: ${TOPIC}\ndata: {"stats":{"cpu":5}}\n\n`);
    xhr.emit('event: other\ndata: {"x":1}\n\n');
    expect(data).toEqual([{ stats: { cpu: 5 } }]);
  });

  it("reports forbidden on a 404 subscribe and does not reconnect", async () => {
    subscribeStatus = 404;
    const { statuses } = open();
    FakeXhr.instances[0].emit('id: cid-1\nevent: PB_CONNECT\ndata: {}\n\n');
    await flush();
    expect(statuses).toEqual(["connecting", "forbidden"]);
    expect(FakeXhr.instances[0].aborted).toBe(true);
    jest.advanceTimersByTime(60_000);
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it("reconnects with backoff when the stream ends", () => {
    const { statuses } = open();
    FakeXhr.instances[0].onload?.();
    expect(statuses).toEqual(["connecting", "reconnecting"]);
    jest.advanceTimersByTime(999);
    expect(FakeXhr.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(FakeXhr.instances).toHaveLength(2);
    FakeXhr.instances[1].onerror?.();
    jest.advanceTimersByTime(1999);
    expect(FakeXhr.instances).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(FakeXhr.instances).toHaveLength(3);
  });

  it("recycles the connection once the buffered stream passes 2 MB, without a reconnecting flash", async () => {
    const { statuses } = open();
    const xhr = FakeXhr.instances[0];
    xhr.emit('id: cid-1\nevent: PB_CONNECT\ndata: {}\n\n');
    await flush();
    xhr.emit(`: ${"x".repeat(2 * 1024 * 1024)}\n\n`);
    expect(xhr.aborted).toBe(true);
    expect(FakeXhr.instances).toHaveLength(2);
    expect(statuses).toEqual(["connecting", "live"]);
  });

  it("close() aborts the stream and cancels a pending reconnect", () => {
    const { close } = open();
    FakeXhr.instances[0].onerror?.();
    close();
    expect(FakeXhr.instances[0].aborted).toBe(true);
    jest.advanceTimersByTime(60_000);
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it("streams synthesized data in demo mode without touching the network", () => {
    setStore({ demoMode: true });
    const { data, statuses, close } = open();
    jest.advanceTimersByTime(3000);
    expect(FakeXhr.instances).toHaveLength(0);
    expect(statuses).toEqual(["live"]);
    expect(data.length).toBeGreaterThanOrEqual(3);
    expect((data[0] as { stats: { cpu: number } }).stats.cpu).toEqual(expect.any(Number));
    close();
    const n = data.length;
    jest.advanceTimersByTime(3000);
    expect(data).toHaveLength(n);
  });
});
