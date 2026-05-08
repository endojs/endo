// @ts-check

/**
 * @file CBOR Diagnostic Notation - re-exports from diagnostic/ module.
 *
 * This file exists for backwards compatibility.
 * New code should import from './diagnostic/index.js' directly.
 */

export {
  encode,
  cborToDiagnostic,
  decode,
  parseDiagnostic,
  hexToBytes,
  bytesToHexString,
  equals,
  diagnosticEquals,
} from './diagnostic/index.js';
