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
