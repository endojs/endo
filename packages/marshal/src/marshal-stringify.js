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

const badArrayHandler = harden({
  get: (_target, name, _receiver) => {
    if (name === 'length') {
      return 0;
    }
    // `throw` is noop since `Fail` throws. But linter confused
    throw Fail`Marshal's parse must not encode any slot positions ${name}`;
  },
});

/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const arrayTarget = freeze(/** @type {any[]} */ ([]));
const badArray = new Proxy(arrayTarget, badArrayHandler);

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
    // `freeze` but not `harden` since the `badArray` proxy and its target
    // must remain trapping.
    // See https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
    freeze({
      body: str,
      slots: badArray,
    }),
  );
harden(parse);

export { stringify, parse };
