// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { InternalSession } from './types.js'
 */

import harden from '@endo/harden';
import { E } from '@endo/eventual-send';
import { makeTagged } from '@endo/pass-style';
import { encodeSwissnum, swissnumFromBytes } from './util.js';

/**
 * @import { CopyTagged } from '@endo/pass-style'
 * @typedef {CopyTagged<'ocapn-sturdyref', undefined>} SturdyRef
 * A `SturdyRef` addresses a capability by `(location, secret)`. It is
 * reified in JavaScript as a tagged value purely so `passStyleOf` has
 * something to return; it never crosses the wire in this form (on the
 * wire OCapN uses the `'ocapn-sturdyref'` spec tag).
 *
 * The `secret` may be a printable ASCII string (the friendly form for
 * locators keyed by name) or raw bytes (Uint8Array) for arbitrary-byte
 * sturdyrefs minted by other implementations such as Spritely Goblins,
 * whose 24-byte random secrets generally aren't valid ASCII.
 *
 * @typedef {object} SturdyRefDetails
 * @property {OcapnLocation} location
 * @property {string | Uint8Array} secret
 */

/** @type {WeakMap<SturdyRef, SturdyRefDetails>} */
const sturdyRefDetails = new WeakMap();

/** @param {any} value */
export const isSturdyRef = value => sturdyRefDetails.has(value);

/** @param {SturdyRef} sturdyRef */
export const getSturdyRefDetails = sturdyRef => sturdyRefDetails.get(sturdyRef);

/**
 * Resolve a `SturdyRef` to an actual reference: local values come from
 * the injected `locator`; remote values are fetched from the peer's
 * bootstrap over a session.
 *
/**
 * @param {SturdyRef} sturdyRef
 * @param {(location: OcapnLocation) => Promise<InternalSession>} provideSession
 * @param {(location: OcapnLocation) => boolean} isSelfLocation
 * @param {{ get(secret: string | Uint8Array): unknown | Promise<unknown> }} locator
 */
export const enlivenSturdyRef = async (
  sturdyRef,
  provideSession,
  isSelfLocation,
  locator,
) => {
  const details = sturdyRefDetails.get(sturdyRef);
  if (!details) {
    throw Error('SturdyRef details not found');
  }
  const { location, secret } = details;

  if (isSelfLocation(location)) {
    const value = await locator.get(secret);
    if (value === undefined) {
      // Intentionally do NOT include `secret` in the message: this
      // error rides up into rejection chains that may be serialized
      // into peer-visible op:abort or logs, and `secret` is the
      // long-lived authority granting access to the capability.
      throw Error('ocapn: locator has no capability for sturdyref secret');
    }
    return value;
  }

  const { ocapn } = await provideSession(location);
  // String secrets get ASCII-encoded into LocatorSecret bytes; raw
  // bytes are forwarded verbatim so non-ASCII swissnums (e.g. the
  // 24-byte randoms Spritely Goblins mints) flow through unchanged.
  const wireSecret =
    typeof secret === 'string'
      ? encodeSwissnum(secret)
      : swissnumFromBytes(secret);
  return E(/** @type {any} */ (ocapn.getRemoteBootstrap())).fetch(wireSecret);
};

/**
 * @typedef {object} SturdyRefTracker
 * @property {(location: OcapnLocation, secret: string | Uint8Array) => SturdyRef} makeSturdyRef
 * @property {(secretBytes: ArrayBufferLike) => Promise<any | undefined>} lookup
 *   Async look up a locally-held capability by the on-wire secret
 *   bytes. Calls through to the injected locator with either the
 *   ASCII-decoded string (for printable secrets) or the raw bytes (for
 *   non-printable secrets like Spritely Goblins' 24-byte randoms).
 */

/**
 * @param {{ get(secret: string | Uint8Array): unknown | Promise<unknown> }} locator
 * @returns {SturdyRefTracker}
 */
export const makeSturdyRefTracker = locator => {
  const textDecoder = new TextDecoder('ascii', { fatal: true });
  return harden({
    makeSturdyRef: (location, secret) => {
      const sturdyRef = makeTagged('ocapn-sturdyref', undefined);
      sturdyRefDetails.set(sturdyRef, { location, secret });
      return harden(sturdyRef);
    },
    lookup: async secretBytes => {
      const view =
        secretBytes instanceof Uint8Array
          ? secretBytes
          : new Uint8Array(/** @type {ArrayBuffer} */ (secretBytes.slice()));
      // Try ASCII decoding first so locators keyed by friendly string
      // names continue to match. If the bytes aren't valid ASCII (e.g.
      // a Spritely-style random 24-byte secret), fall back to passing
      // the raw bytes through; locators that index by bytes can match
      // those, locators that don't will simply return undefined.
      try {
        const secret = textDecoder.decode(view);
        return locator.get(secret);
      } catch {
        return locator.get(view);
      }
    },
  });
};
