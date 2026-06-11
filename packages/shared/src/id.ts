/**
 * Random 128-bit ID as 32 lowercase hex chars (TD-3: random IDs, no
 * sequence leakage). Works in Node and the browser via WebCrypto.
 */
export function createId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) {
    id += byte.toString(16).padStart(2, "0");
  }
  return id;
}

export const ID_PATTERN = /^[0-9a-f]{32}$/;
