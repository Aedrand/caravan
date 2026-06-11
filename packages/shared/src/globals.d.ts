/**
 * Minimal WebCrypto surface — present in every supported runtime (Node ≥20,
 * all browsers) but absent from the pure ES lib types this universal package
 * compiles against. Consumers (server/web) see their own richer globals.
 */
declare var crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};
