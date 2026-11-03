import { networkInterfaces } from "node:os";

/**
 * Non-loopback IPv4 addresses of this machine. A phone on the same Wi-Fi can
 * only reach the dev server through one of these, never through `localhost`.
 */
export function lanAddresses(): string[] {
  const addresses: string[] = [];

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses;
}
