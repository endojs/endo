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
import { encodeBase64 } from '@endo/base64';
import { q } from '@endo/errors';

import { BlobRefInterface } from '../type-guards.js';
import {
  EMPTY_BYTES,
  makeBytesReaderFromBytes,
  toSafeNumber,
} from './helpers.js';

const textDecoder = new TextDecoder();

/**
 * Mint a `BlobRef` from a captured `Uint8Array`. The `BlobRef`'s
 * identity (algorithm + hash + size) is computed at construction;
 * subsequent mutations to the originating file are independent.
 *
 * When `infoOverride` is supplied, its `{ algorithm, hash }` are used
 * verbatim instead of the default SHA-256-over-captured-bytes — a
 * content-address backend (e.g. the git-tree FsBackend) supplies the
 * native hash it already knows (`git-sha1` blob OID), which git computes
 * over the framed payload `blob <size>\0<bytes>`, NOT the raw bytes, so a
 * consumer comparing hashes across sources must distinguish the two.
 * `size` is always the captured byte length regardless of the override.
 *
 * @param {Uint8Array} bytes
 * @param {string} [help]  optional override for the `help()` body
 * @param {{ algorithm: string, hash: string }} [infoOverride]
 *   optional backend-supplied algorithm + hash
 */
export const makeBlobRefExo = (bytes, help, infoOverride) => {
  const captured = harden(new Uint8Array(bytes));
  let info;
  if (infoOverride !== undefined) {
    info = harden({
      algorithm: infoOverride.algorithm,
      hash: infoOverride.hash,
      size: BigInt(captured.length),
    });
  } else {
    const hashBytes = createHash('sha256').update(captured).digest();
    info = harden({
      algorithm: 'sha256',
      // `encodeBase64` (over the `Buffer`, a `Uint8Array` subclass) matches the
      // base64 hash spelling every other implementer in this PR uses, rather
      // than the Node-only `Buffer.prototype.toString('base64')`.
      hash: encodeBase64(hashBytes),
      size: BigInt(captured.length),
    });
  }

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
    // Whole-value conveniences mirroring the daemon `EndoBlob` / lite
    // `SnapshotBlob` surface, decoding the captured bytes as UTF-8.
    async text() {
      return textDecoder.decode(captured);
    },
    async json() {
      return JSON.parse(textDecoder.decode(captured));
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
