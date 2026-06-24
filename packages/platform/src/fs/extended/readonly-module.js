// @ts-check
/**
 * Entry point for formulating a read-only attenuator over an
 * existing `Filesystem` cap as a daemon caplet via
 * `host.makeUnconfined`.
 *
 * Why a module (and not `storeValue(readOnly(fs))` from the
 * client)? `readOnly` is a client-side wrap with no daemon
 * formula, so the daemon can't marshal it back out and
 * `storeValue` fails with "No corresponding formula for (an
 * object)". A `makeUnconfined` recipe — module URL + env +
 * powers — IS a formula the daemon can persist, re-instantiate
 * on restart, and hand back to the marshaller.
 *
 * Usage from a host:
 *
 *   await E(host).makeUnconfined('@node', moduleUrl, {
 *     powersName: '@agent',
 *     resultName: 'tmp-ro',
 *     env: { SOURCE_NAME: 'tmp' },          // or 'a/b/c'
 *   });
 *
 * `SOURCE_NAME` is split on `/` and `.` so deeply-nested pet-name
 * paths work the same way `EndoHost.lookup` expects them.
 */

import { E } from '@endo/eventual-send';

import { readOnly } from './readonly.js';

/**
 * @param {object} powers  the resolved `powersName` cap; must
 *   expose `lookup(name)` (e.g. `@agent`).
 * @param {unknown} _context
 * @param {{ env?: Record<string, string> }} [opts]
 * @returns {Promise<object>} a read-only `Filesystem` cap
 */
export const make = async (powers, _context, opts = {}) => {
  const env = opts.env || {};
  const sourceName = env.SOURCE_NAME;
  if (typeof sourceName !== 'string' || sourceName.length === 0) {
    throw new Error(
      'readonly-module: env.SOURCE_NAME (pet name of the backing filesystem) is required',
    );
  }
  const segments = sourceName.split(/[./]/).filter(Boolean);
  if (segments.length === 0) {
    throw new Error(
      `readonly-module: env.SOURCE_NAME ${JSON.stringify(sourceName)} did not yield any pet-name segments`,
    );
  }
  // Pipeline the walk so a deep `lookup` chain costs one CapTP
  // round trip per segment, not two (lookup + then resolve).
  let capPromise = E(powers).lookup(segments[0]);
  for (let i = 1; i < segments.length; i += 1) {
    capPromise = E(capPromise).lookup(segments[i]);
  }
  const source = await capPromise;
  return readOnly(source);
};
harden(make);
