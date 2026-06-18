// @ts-check
/**
 * `BlobRef` exo factory — a content-addressed handle over a
 * captured `Uint8Array` snapshot (DESIGN.md §6).
 *
 * Identical across the in-memory, node-fs, and from-mount
 * `Filesystem` implementations: defensively copy + harden the
 * bytes, SHA-256 them, return an exo whose `getInfo()` carries
 * the algorithm / hash / size triple and whose `fetch(offset,
 * length)` returns a `PassableBytesReader` over the captured
 * range.
 */

import { createHash } from 'node:crypto';

import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';

import { BlobRefInterface } from '../type-guards.js';
import {
  EMPTY_BYTES,
  makeBytesReaderFromBytes,
  toSafeNumber,
} from './helpers.js';

/**
 * Mint a `BlobRef` from a captured `Uint8Array`. The `BlobRef`'s
 * identity (algorithm + hash + size) is computed at construction;
 * subsequent mutations to the originating file are independent.
 *
 * @param {Uint8Array} bytes
 * @param {string} [help]  optional override for the `help()` body
 */
export const makeBlobRefExo = (bytes, help) => {
  const captured = harden(new Uint8Array(bytes));
  const hashBytes = createHash('sha256').update(captured).digest();
  const info = harden({
    algorithm: 'sha256',
    hash: hashBytes.toString('base64'),
    size: BigInt(captured.length),
  });

  return makeExo('BlobRef', BlobRefInterface, {
    getInfo() {
      return info;
    },
    async fetch(offset, length) {
      const off = toSafeNumber(offset, 'offset');
      const len = toSafeNumber(length, 'length');
      const end = Math.min(off + len, captured.length);
      const slice =
        off >= captured.length ? EMPTY_BYTES : captured.slice(off, end);
      return makeBytesReaderFromBytes(slice);
    },
    help(method) {
      if (method === undefined) {
        return help ?? 'BlobRef: content-addressed handle (DESIGN.md §6).';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(makeBlobRefExo);
