// @ts-check

/**
 * Public entry point for `@endo/ocapn`.
 *
 * The exports map deliberately keeps the public runtime surface tiny
 * (this main entry, `./src/client/util.js` for swissnum helpers, and
 * `./src/netlayers/websocket.js` for the websocket transport). Any new
 * value or type that consumers need should be added here in preference
 * to opening another subpath, since each subpath is a long-term API
 * commitment.
 *
 * Note for typedef forwards below: a JS `export *` does NOT re-export
 * `@typedef` declarations — typedefs aren't part of the runtime
 * namespace, and JSDoc-checkJs only finds them by direct module
 * identity. Forwarding them with explicit `@typedef {import(...)}`
 * lines is what makes `@import { Foo } from '@endo/ocapn'` resolve in
 * downstream JSDoc.
 *
 * @typedef {import('./src/client/types.js').SwissNum} SwissNum
 * @typedef {import('./src/codecs/components.js').OcapnLocation} OcapnLocation
 */

export { makeClient } from './src/client/index.js';
export { swissnumFromBytes, swissnumToBytes } from './src/client/util.js';
