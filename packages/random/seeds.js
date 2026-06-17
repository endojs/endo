// @ts-check

// Canonical seeds for Endo deterministic tests and benchmarks.
//
// Chris Hibbert really wanted the default seed to be `Bob's Coffee
// Façade`, which is conveniently exactly 64 bits long, repeated to
// fill the 32-byte ChaCha-family key.

import harden from '@endo/harden';

/**
 * 32 bytes: `b0b5c0ffeefacade` repeated four times.  The default
 * seed for Endo deterministic fuzz tests and benchmarks; share this
 * across packages so a single seed change propagates.
 */
export const bobsCoffee32 = harden(
  Uint8Array.of(
    0xb0,
    0xb5,
    0xc0,
    0xff,
    0xee,
    0xfa,
    0xca,
    0xde,
    0xb0,
    0xb5,
    0xc0,
    0xff,
    0xee,
    0xfa,
    0xca,
    0xde,
    0xb0,
    0xb5,
    0xc0,
    0xff,
    0xee,
    0xfa,
    0xca,
    0xde,
    0xb0,
    0xb5,
    0xc0,
    0xff,
    0xee,
    0xfa,
    0xca,
    0xde,
  ),
);
