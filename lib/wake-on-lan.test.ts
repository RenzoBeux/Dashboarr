type SendCall = {
  buffer: Buffer;
  offset: number;
  length: number;
  port: number;
  address: string;
};

const mockSocket = {
  on: jest.fn(),
  once: jest.fn(),
  bind: jest.fn(),
  setBroadcast: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
};

const sendCalls: SendCall[] = [];

const resetMockSocket = () => {
  sendCalls.length = 0;
  mockSocket.on.mockReset();
  mockSocket.once.mockReset();
  mockSocket.bind.mockReset();
  mockSocket.setBroadcast.mockReset();
  mockSocket.send.mockReset();
  mockSocket.close.mockReset();

  mockSocket.bind.mockImplementation((_port: number, cb: () => void) => cb());
  mockSocket.send.mockImplementation(
    (
      buffer: Buffer,
      offset: number,
      length: number,
      port: number,
      address: string,
      cb: (err?: Error | null) => void,
    ) => {
      sendCalls.push({ buffer, offset, length, port, address });
      cb(undefined);
    },
  );
};

jest.mock("react-native-udp", () => ({
  __esModule: true,
  default: { createSocket: jest.fn(() => mockSocket) },
}));

import { sendWakeOnLan, WakeOnLanError } from "./wake-on-lan";

describe("sendWakeOnLan — MAC parsing", () => {
  beforeEach(() => resetMockSocket());

  it("rejects an obviously invalid MAC (synchronous throw, before Promise)", () => {
    // parseMac runs synchronously in sendWakeOnLan before the Promise is
    // constructed, so the WakeOnLanError escapes synchronously.
    expect(() => sendWakeOnLan({ mac: "not-a-mac" })).toThrow(WakeOnLanError);
    expect(() => sendWakeOnLan({ mac: "not-a-mac" })).toThrow(/Invalid MAC/);
  });

  it("rejects a right-length non-hex MAC", () => {
    expect(() => sendWakeOnLan({ mac: "aabbccddeegg" })).toThrow(WakeOnLanError);
  });

  it("accepts colon-separated MACs", async () => {
    await sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" });
    expect(sendCalls).toHaveLength(1);
  });

  it("accepts dash-separated MACs", async () => {
    await sendWakeOnLan({ mac: "aa-bb-cc-dd-ee-ff" });
    expect(sendCalls).toHaveLength(1);
  });

  it("accepts dot-separated MACs (Cisco notation)", async () => {
    await sendWakeOnLan({ mac: "aabb.ccdd.eeff" });
    expect(sendCalls).toHaveLength(1);
  });

  it("accepts MACs with no separators", async () => {
    await sendWakeOnLan({ mac: "aabbccddeeff" });
    expect(sendCalls).toHaveLength(1);
  });

  it("is case-insensitive", async () => {
    await sendWakeOnLan({ mac: "AA:BB:CC:DD:EE:FF" });
    expect(sendCalls).toHaveLength(1);
  });
});

describe("sendWakeOnLan — magic packet shape", () => {
  beforeEach(() => resetMockSocket());

  it("builds a 102-byte packet", async () => {
    await sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" });
    expect(sendCalls[0].buffer).toHaveLength(102);
    expect(sendCalls[0].length).toBe(102);
  });

  it("starts the packet with 6 bytes of 0xff", async () => {
    await sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" });
    const buf = sendCalls[0].buffer;
    for (let i = 0; i < 6; i++) {
      expect(buf[i]).toBe(0xff);
    }
  });

  it("repeats the parsed MAC bytes 16 times after the header", async () => {
    await sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" });
    const buf = sendCalls[0].buffer;
    const expected = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
    for (let rep = 0; rep < 16; rep++) {
      for (let j = 0; j < 6; j++) {
        expect(buf[6 + rep * 6 + j]).toBe(expected[j]);
      }
    }
  });

  it("produces equivalent bytes regardless of MAC separator format", async () => {
    await sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" });
    const colonBytes = Buffer.from(sendCalls[0].buffer);

    resetMockSocket();
    await sendWakeOnLan({ mac: "aabbccddeeff" });
    const noSepBytes = sendCalls[0].buffer;

    expect(noSepBytes.equals(colonBytes)).toBe(true);
  });
});

describe("sendWakeOnLan — destination", () => {
  beforeEach(() => resetMockSocket());

  it("defaults to broadcast 255.255.255.255 and port 9", async () => {
    await sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" });
    expect(sendCalls[0].address).toBe("255.255.255.255");
    expect(sendCalls[0].port).toBe(9);
  });

  it("uses the provided broadcastAddress and port", async () => {
    await sendWakeOnLan({
      mac: "aa:bb:cc:dd:ee:ff",
      broadcastAddress: "192.168.1.255",
      port: 7,
    });
    expect(sendCalls[0].address).toBe("192.168.1.255");
    expect(sendCalls[0].port).toBe(7);
  });

  it("falls back to the default broadcast when broadcastAddress is empty string", async () => {
    await sendWakeOnLan({
      mac: "aa:bb:cc:dd:ee:ff",
      broadcastAddress: "",
    });
    expect(sendCalls[0].address).toBe("255.255.255.255");
  });

  it("calls setBroadcast(true) before send", async () => {
    await sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" });
    expect(mockSocket.setBroadcast).toHaveBeenCalledWith(true);
    const broadcastOrder = mockSocket.setBroadcast.mock.invocationCallOrder[0];
    const sendOrder = mockSocket.send.mock.invocationCallOrder[0];
    expect(broadcastOrder).toBeLessThan(sendOrder);
  });
});

describe("sendWakeOnLan — error and cleanup", () => {
  beforeEach(() => resetMockSocket());

  it("rejects with a WakeOnLanError when send-callback returns an Error", async () => {
    mockSocket.send.mockImplementation(
      (
        _buf: Buffer,
        _o: number,
        _l: number,
        _p: number,
        _a: string,
        cb: (err?: Error | null) => void,
      ) => cb(new Error("network unreachable")),
    );

    await expect(sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" })).rejects.toThrow(
      WakeOnLanError,
    );
    await expect(sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" })).rejects.toThrow(
      /network unreachable/,
    );
  });

  it("closes the socket after a successful send", async () => {
    await sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" });
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it("closes the socket after a failed send", async () => {
    mockSocket.send.mockImplementation(
      (
        _buf: Buffer,
        _o: number,
        _l: number,
        _p: number,
        _a: string,
        cb: (err?: Error | null) => void,
      ) => cb(new Error("boom")),
    );
    await expect(sendWakeOnLan({ mac: "aa:bb:cc:dd:ee:ff" })).rejects.toThrow();
    expect(mockSocket.close).toHaveBeenCalled();
  });
});
