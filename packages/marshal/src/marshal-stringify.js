/// <reference types="ses"/>

import { makeMarshal } from './marshal.js';

/** @typedef {import('@endo/pass-style').Passable} Passable */

const { Fail } = assert;

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

const badArray = harden(new Proxy(harden([]), badArrayHandler));

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
 * @returns {Passable}
 */
const parse = str =>
  unserialize(
    harden({
      body: str,
      slots: badArray,
    }),
  );
harden(parse);

export { stringify, parse };
