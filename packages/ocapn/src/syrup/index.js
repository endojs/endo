// @ts-check

/**
 * @file Syrup codec for OCapN messages.
 *
 * This module provides Syrup encoding/decoding following the OCapN Syrup
 * specification. Syrup is a canonical, text-delimited binary serialization
 * format.
 *
 * Usage:
 *
 * ```js
 * // Import only what you need
 * import { makeSyrupWriter } from '@endo/ocapn/syrup/encode.js';
 * import { makeSyrupReader } from '@endo/ocapn/syrup/decode.js';
 *
 * // Or import from the index
 * import { makeSyrupWriter, makeSyrupReader } from '@endo/ocapn/syrup';
 * ```
 *
 * See docs/syrup-specification.md for the specification.
 */

export { SyrupWriter, makeSyrupWriter } from './encode.js';
export { SyrupReader, makeSyrupReader, peekTypeHint } from './decode.js';
export { BufferReader } from './buffer-reader.js';
export { BufferWriter } from './buffer-writer.js';
export { compareImmutableArrayBuffers } from './compare.js';
