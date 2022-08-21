// @ts-check

/// <reference types="ses"/>

import { Nat } from '@endo/nat';
import { assertPassable } from './passStyleOf.js';

import { getInterfaceOf } from './helpers/remotable.js';
import { getErrorConstructor } from './helpers/error.js';
import {
  QCLASS,
  makeEncodeToJSON,
  makeDecodeFromJSON,
} from './encodeToJSON.js';

/** @typedef {import('./types.js').MakeMarshalOptions} MakeMarshalOptions */
/** @template Slot @typedef {import('./types.js').ConvertSlotToVal<Slot>} ConvertSlotToVal */
/** @template Slot @typedef {import('./types.js').ConvertValToSlot<Slot>} ConvertValToSlot */
/** @template Slot @typedef {import('./types.js').Serialize<Slot>} Serialize */
/** @template Slot @typedef {import('./types.js').Unserialize<Slot>} Unserialize */
/** @typedef {import('./types.js').Passable} Passable */
/** @typedef {import('./types.js').InterfaceSpec} InterfaceSpec */
/** @typedef {import('./types.js').Encoding} Encoding */

const { isArray } = Array;
const { details: X, quote: q } = assert;

/** @type {ConvertValToSlot<any>} */
const defaultValToSlotFn = x => x;
/** @type {ConvertSlotToVal<any>} */
const defaultSlotToValFn = (x, _) => x;

/**
 * @template Slot
 * @param {ConvertValToSlot<Slot>} [convertValToSlot]
 * @param {ConvertSlotToVal<Slot>} [convertSlotToVal]
 * @param {MakeMarshalOptions} [options]
 */
export const makeMarshal = (
  convertValToSlot = defaultValToSlotFn,
  convertSlotToVal = defaultSlotToValFn,
  {
    errorTagging = 'on',
    marshalName = 'anon-marshal',
    // TODO Temporary hack.
    // See https://github.com/Agoric/agoric-sdk/issues/2780
    errorIdNum = 10000,
    // We prefer that the caller instead log to somewhere hidden
    // to be revealed when correlating with the received error.
    marshalSaveError = err =>
      console.log('Temporary logging of sent error', err),
  } = {},
) => {
  assert.typeof(marshalName, 'string');
  assert(
    errorTagging === 'on' || errorTagging === 'off',
    X`The errorTagging option can only be "on" or "off" ${errorTagging}`,
  );
  const nextErrorId = () => {
    errorIdNum += 1;
    return `error:${marshalName}#${errorIdNum}`;
  };

  /**
   * @type {Serialize<Slot>}
   */
  const serialize = root => {
    const slots = [];
    // maps val (promise or remotable) to index of slots[]
    const slotMap = new Map();

    /**
     * @param {Passable} val
     * @param {InterfaceSpec=} iface
     * @returns {Encoding}
     */
    function serializeSlot(val, iface = undefined) {
      let slotIndex;
      if (slotMap.has(val)) {
        // TODO assert that it's the same iface as before
        slotIndex = slotMap.get(val);
        assert.typeof(slotIndex, 'number');
        iface = undefined;
      } else {
        const slot = convertValToSlot(val);

        slotIndex = slots.length;
        slots.push(slot);
        slotMap.set(val, slotIndex);
      }

      // TODO explore removing this special case
      if (iface === undefined) {
        return harden({
          [QCLASS]: 'slot',
          index: slotIndex,
        });
      }
      return harden({
        [QCLASS]: 'slot',
        iface,
        index: slotIndex,
      });
    }

    /**
     * Even if an Error is not actually passable, we'd rather send
     * it anyway because the diagnostic info carried by the error
     * is more valuable than diagnosing why the error isn't
     * passable. See comments in ErrorHelper.
     *
     * @param {Error} err
     * @returns {Encoding}
     */
    const encodeErrorToJSON = err => {
      // Must encode `cause`, `errors`.
      // nested non-passable errors must be ok from here.
      if (errorTagging === 'on') {
        // We deliberately do not share the stack, but it would
        // be useful to log the stack locally so someone who has
        // privileged access to the throwing Vat can correlate
        // the problem with the remote Vat that gets this
        // summary. If we do that, we could allocate some random
        // identifier and include it in the message, to help
        // with the correlation.
        const errorId = nextErrorId();
        assert.note(err, X`Sent as ${errorId}`);
        marshalSaveError(err);
        return harden({
          [QCLASS]: 'error',
          errorId,
          message: `${err.message}`,
          name: `${err.name}`,
        });
      } else {
        return harden({
          [QCLASS]: 'error',
          message: `${err.message}`,
          name: `${err.name}`,
        });
      }
    };

    const encodeRemotableToJSON = val => {
      const iface = getInterfaceOf(val);
      // console.log(`serializeSlot: ${val}`);
      return serializeSlot(val, iface);
    };

    const encode = makeEncodeToJSON({
      encodeRemotableToJSON,
      encodePromiseToJSON: serializeSlot,
      encodeErrorToJSON,
    });

    const encoded = encode(root);

    return harden({
      body: JSON.stringify(encoded),
      slots,
    });
  };

  const makeFullRevive = slots => {
    /** @type {Map<number, Passable>} */
    const valMap = new Map();

    function unserializeSlot(index, iface) {
      if (valMap.has(index)) {
        return valMap.get(index);
      }
      // TODO SECURITY HAZARD: must enfoce that remotable vs promise
      // is according to the encoded string.
      const slot = slots[Number(Nat(index))];
      const val = convertSlotToVal(slot, iface);
      valMap.set(index, val);
      return val;
    }

    const decodeErrorFromJSON = rawTree => {
      // Must decode `cause` and `errors` properties
      const { name, message, errorId } = rawTree;
      assert.typeof(
        name,
        'string',
        X`invalid error name typeof ${q(typeof name)}`,
      );
      assert.typeof(
        message,
        'string',
        X`invalid error message typeof ${q(typeof message)}`,
      );
      const EC = getErrorConstructor(`${name}`) || Error;
      // errorId is a late addition so be tolerant of its absence.
      const errorName =
        errorId === undefined
          ? `Remote${EC.name}`
          : `Remote${EC.name}(${errorId})`;
      // Due to a defect in the SES type definition, the next line is
      // fails a type check.
      // Pending https://github.com/endojs/endo/issues/977
      // @ts-ignore-next-line
      const error = assert.error(`${message}`, EC, { errorName });
      return error;
    };

    const decodeRemotableFromJSON = rawTree => {
      const { index, iface } = rawTree;
      const val = unserializeSlot(index, iface);
      return val;
    };

    const decodePromiseFromJSON = rawTree => {
      const { index } = rawTree;
      const val = unserializeSlot(index);
      return val;
    };

    const fullRevive = makeDecodeFromJSON({
      decodeRemotableFromJSON,
      decodePromiseFromJSON,
      decodeErrorFromJSON,
    });
    return fullRevive;
  };
  /**
   * @type {Unserialize<Slot>}
   */
  const unserialize = data => {
    assert.typeof(
      data.body,
      'string',
      X`unserialize() given non-capdata (.body is ${data.body}, not string)`,
    );
    assert(
      isArray(data.slots),
      X`unserialize() given non-capdata (.slots are not Array)`,
    );
    const rawTree = harden(JSON.parse(data.body));
    const fullRevive = makeFullRevive(data.slots);
    const result = harden(fullRevive(rawTree));
    // See https://github.com/Agoric/agoric-sdk/issues/4337
    assertPassable(result);
    return result;
  };

  return harden({
    serialize,
    unserialize,
  });
};
