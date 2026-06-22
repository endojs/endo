export {};

/**
 * A `RandomSource` is a function that fills a `Uint8Array` with random
 * bytes.  The shape mirrors `crypto.getRandomValues` (minus the
 * return value), so the canonical browser/Node entropy source and the
 * `fillRandomBytes` method of a `@endo/chacha12`-backed
 * `ChaCha12Generator` (returned by `makeChaCha12(seed)`) are both
 * directly usable wherever a `RandomSource` is expected.
 *
 * Implementations MUST set every element of the supplied `Uint8Array`
 * and MUST NOT retain any reference after the call returns.
 */
export type RandomSource = (out: Uint8Array) => void;
