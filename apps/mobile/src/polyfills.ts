import { randomUUID } from "expo-crypto";

// The shared schema generates IDs through crypto.randomUUID(). Hermes needs
// the native implementation; keep any existing Web Crypto methods intact.
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: {},
    configurable: true,
  });
}

if (typeof globalThis.crypto.randomUUID !== "function") {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: randomUUID,
    configurable: true,
  });
}
