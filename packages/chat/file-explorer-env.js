// @ts-check
/* global globalThis */

// Environment shims that let `@endo/endo-fs` (and its
// `@endo/exo-stream` dependency) run inside the chat browser bundle.
//
// The chat app deliberately never calls SES `lockdown()` — Monaco
// relies on mutable intrinsics — so `globalThis.harden`, which the
// `@endo/endo-fs` modules reference as a free variable per the
// HardenedJS convention, is never installed. We install
// `@endo/harden`'s standalone hardener instead; it freezes own
// properties without traversing prototypes, which matches the chat
// app's no-lockdown stance.
//
// `@endo/endo-fs/src/from-mount.js` decodes base64 with Node's
// `Buffer`; the browser has no `Buffer`, so we provide the minimal
// `from`/`concat` surface that module touches.
//
// This module is import-ordered before any `@endo/endo-fs` module
// so the shims are in place by the time those modules evaluate.

import harden from '@endo/harden';

const globals = /** @type {Record<string, any>} */ (globalThis);

if (typeof globals.harden !== 'function') {
  globals.harden = harden;
}

if (typeof globals.Buffer === 'undefined') {
  globals.Buffer = {
    /**
     * @param {string | Uint8Array | ArrayLike<number>} value
     * @param {string} [encoding]
     * @returns {Uint8Array}
     */
    from(value, encoding) {
      if (typeof value === 'string') {
        if (encoding === 'base64') {
          const binary = atob(value);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }
          return bytes;
        }
        return new TextEncoder().encode(value);
      }
      return new Uint8Array(value);
    },
    /**
     * @param {Uint8Array[]} list
     * @returns {Uint8Array}
     */
    concat(list) {
      let total = 0;
      for (const part of list) {
        total += part.length;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const part of list) {
        out.set(part, offset);
        offset += part.length;
      }
      return out;
    },
  };
}
