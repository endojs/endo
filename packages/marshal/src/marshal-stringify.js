/// <reference types="ses"/>

import { Fail } from '@endo/errors';
import { makeMarshal } from './marshal.js';

/** @import {Passable} from '@endo/pass-style' */

const { freeze } = Object;

/** @type {import('./types.js').ConvertValToSlot<any>} */
const doNotConvertValToSlot = val =>
  Fail`Marshal's stringify rejects presences and promises ${val}`;

/** @type {import('./types.js').ConvertSlotToVal<any>} */
const doNotConvertSlotToVal = (slot, _iface) =>
  Fail`Marshal's parse must not encode any slots ${slot}`;

/**
 * While the resulting proxy can be frozen, it refuses to be made non-trapping
 * and so cannot be hardened once harden implies non-trapping.
 *
 * @type {ProxyHandler<any>}
 */
const badArrayHandler = harden({
  get: (_target, name, _receiver) => {
    if (name === 'length') {
      return 0;
    }
    // `throw` is noop since `Fail` throws. But linter confused
    throw Fail`Marshal's parse must not encode any slot positions ${name}`;
  },
  suppressTrapping(_target) {
    return false;
  },
});

// Note the use of `freeze` rather than `harden` below. This is because
// `harden` will imply no-trapping, and we depend on proxies with these
// almost-empty targets to remain trapping for the `get` trap
// which can still be interesting even when the target is frozen.
// `get`, if not naming an own property, is still a general trap,
// which we rely on.
const badArray = new Proxy(freeze([]), badArrayHandler);

const { serialize, unserialize } = makeMarshal(
  doNotConvertValToSlot,
  doNotConvertSlotToVal,
  {
    errorTagging: 'off',
    // TODO fix tests to works with smallcaps.
    serializeBodyFormat: 'capdata',
  },
);

/**
 * @param {Passable} val
 * @returns {string}
 */
const stringify = val => serialize(val).body;
harden(stringify);

/**
 * @param {string} str
 * @returns {unknown}
 */
const parse = str =>
  unserialize(
    // Note the use of `freeze` rather than `harden` below. This is because
    // `harden` will imply no-trapping, and we depend on proxies with these
    // almost-empty targets to remain trapping for the `get` trap
    // which can still be interesting even when the target is frozen.
    // `get`, if not naming an own property, is still a general trap,
    // which we rely on.
    freeze({
      body: str,
      slots: badArray,
    }),
  );
harden(parse);

export { stringify, parse };
