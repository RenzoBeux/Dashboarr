import dgram from "react-native-udp";
import { Buffer } from "buffer";

export class WakeOnLanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WakeOnLanError";
  }
}

interface WakeOnLanOptions {
  mac: string;
  broadcastAddress?: string;
  port?: number;
}

/**
 * Parse a MAC address string into 6 bytes. Accepts ':', '-', '.' separators or none.
 */
function parseMac(mac: string): number[] {
  const clean = mac.replace(/[:\-.\s]/g, "").toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(clean)) {
    throw new WakeOnLanError(`Invalid MAC address: ${mac}`);
  }
  const bytes: number[] = [];
  for (let i = 0; i < 12; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Build a Wake-on-LAN magic packet: 6x 0xff + 16x the MAC bytes = 102 bytes.
 */
function buildMagicPacket(mac: string): Buffer {
  const macBytes = parseMac(mac);
  const packet = Buffer.alloc(102);
  for (let i = 0; i < 6; i++) {
    packet[i] = 0xff;
  }
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 6; j++) {
      packet[6 + i * 6 + j] = macBytes[j];
    }
  }
  return packet;
}

/**
 * Send a Wake-on-LAN magic packet as a UDP broadcast.
 * Defaults: port 9, broadcast 255.255.255.255 (use a subnet-directed broadcast like 192.168.1.255 for best results).
 */
export function sendWakeOnLan(options: WakeOnLanOptions): Promise<void> {
  const broadcast = options.broadcastAddress || "255.255.255.255";
  const port = options.port ?? 9;
  const packet = buildMagicPacket(options.mac);

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: "udp4" });
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // Ignore close errors
      }
      if (err) reject(new WakeOnLanError(err.message));
      else resolve();
    };

    socket.once("error", (err: Error) => finish(err));

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch (err) {
        finish(err instanceof Error ? err : new Error("setBroadcast failed"));
        return;
      }
      socket.send(
        packet,
        0,
        packet.length,
        port,
        broadcast,
        (err) => finish(err ?? undefined),
      );
    });
  });
}
