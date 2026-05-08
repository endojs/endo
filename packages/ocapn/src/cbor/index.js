// @ts-check

/**
 * @file CBOR codec for OCapN messages.
 *
 * This module provides CBOR encoding/decoding following the OCapN CBOR
 * specification. All output is canonical and can be read by any RFC 8949
 * compliant CBOR decoder.
 *
 * See docs/cbor-encoding.md for the specification.
 */

import harden from '@endo/harden';
import { makeCborWriter } from './encode.js';
import { makeCborReader } from './decode.js';
import { cborToDiagnostic } from './diagnostic/index.js';

export { CborWriter, makeCborWriter } from './encode.js';
export { CborReader, makeCborReader } from './decode.js';

// Diagnostic notation codec (re-exported for convenience)
export {
  encode as diagnosticEncode,
  decode as diagnosticDecode,
  cborToDiagnostic,
  hexToBytes,
  bytesToHexString,
  parseDiagnostic,
  diagnosticEquals,
} from './diagnostic/index.js';

/**
 * Instance of the OCapN codec interface backed by CBOR.
 *
 * @type {import('../codec-interface.js').OcapnCodec}
 */
export const cborCodec = harden({
  makeReader: makeCborReader,
  makeWriter: makeCborWriter,
  diagnose: cborToDiagnostic,
});
