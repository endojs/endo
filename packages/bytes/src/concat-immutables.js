// @ts-check

import harden from '@endo/harden';

import { bytesFromImmutable } from './from-immutable.js';
import { bytesToImmutable } from './to-immutable.js';
import { concatBytes } from './concat.js';

/**
 * Concatenates a list of immutable `ArrayBuffer` values into a single
 * hardened immutable `ArrayBuffer`.
 *
 * Equivalent to
 * `bytesToImmutable(concatBytes(buffers.map(bytesFromImmutable)))`,
 * provided as a single-call helper because the composition is common
 * when assembling protocol records from immutable byte fragments.
 *
 * @param {ReadonlyArray<ArrayBufferLike>} buffers
 * @returns {ArrayBuffer}
 */
export const concatImmutables = buffers =>
  bytesToImmutable(concatBytes(buffers.map(bytesFromImmutable)));
harden(concatImmutables);
