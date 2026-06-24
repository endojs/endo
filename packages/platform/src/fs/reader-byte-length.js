// @ts-check

import harden from '@endo/harden';

/** @import { Reader } from '@endo/stream' */

/**
 * Count the bytes a reader will yield, by draining it. This is the fallback
 * `getInfo().size` path for a content store whose `fetch()` result does not
 * surface a cheap `size()` (e.g. a simple in-memory store); the real
 * content-store backing supplies `size()` from a stat, so the drain only runs
 * where the bytes are already in memory.
 *
 * @param {() => Reader<Uint8Array>} makeFileReader
 * @returns {Promise<bigint>}
 */
export const byteLengthOfReader = async makeFileReader => {
  const reader = makeFileReader();
  let total = 0n;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { value, done } = await reader.next();
    if (done) {
      return total;
    }
    total += BigInt(value.length);
  }
};
harden(byteLengthOfReader);
