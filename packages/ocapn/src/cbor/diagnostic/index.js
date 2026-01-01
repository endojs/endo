// @ts-check

/**
 * @file CBOR Diagnostic Notation codec.
 *
 * A text-based codec for CBOR data using the diagnostic notation
 * specified in RFC 8949 Appendix G.
 *
 * This codec is primarily for testing and debugging, allowing
 * CBOR data to be expressed and validated in human-readable form.
 *
 * Encode: CBOR bytes → diagnostic string
 * Decode: diagnostic string → JavaScript values
 */

export { encode, cborToDiagnostic } from './encode.js';
export { decode, parseDiagnostic } from './decode.js';
export {
  hexToBytes,
  bytesToHexString,
  equals,
  diagnosticEquals,
} from './util.js';
