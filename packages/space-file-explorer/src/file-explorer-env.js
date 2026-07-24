// @ts-check

// Environment shims that let `@endo/platform/fs/extended` (and its
// `@endo/exo-stream` dependency) run inside the chat browser bundle.
//
// `@endo/platform/fs/extended` modules reference `globalThis.harden` as a
// free variable per the HardenedJS convention. The chat entry locks the
// realm down via `@endo/init` (see main.js / pre-lockdown.js), which
// installs the SES `harden` global — so this install is normally a no-op
// fallback. It only takes effect if an `@endo/platform/fs/extended` module
// is somehow loaded before lockdown, in which case `@endo/harden`'s
// standalone hardener stands in.
//
// `@endo/platform/fs/extended/from-mount.js` decodes base64 with Node's
// `Buffer`; the browser has no `Buffer`, so we provide the minimal
// `from`/`concat` surface that module touches.
//
// This module is import-ordered before any `@endo/platform/fs/extended` module
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
