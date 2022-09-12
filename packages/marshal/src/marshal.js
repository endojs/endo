// @ts-check

/// <reference types="ses"/>

import { Nat } from '@endo/nat';
import { assertPassable } from './passStyleOf.js';

import { getInterfaceOf } from './helpers/remotable.js';
import { getErrorConstructor } from './helpers/error.js';
import {
  QCLASS,
  makeEncodeToCapData,
  makeDecodeFromCapData,
} from './encodeToCapData.js';
import {
  makeDecodeFromSmallcaps,
  makeEncodeToSmallcaps,
  SCLASS,
} from './encodeToSmallcaps.js';

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
    useSmallcaps = false,
  } = {},
) => {
  assert.typeof(marshalName, 'string');
  errorTagging === 'on' ||
    errorTagging === 'off' ||
    assert.fail(
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
    const encodeErrorToCapData = err => {
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

    if (useSmallcaps) {
      /**
       * @param {string} prefix
       * @param {Passable} passable
       * @param {string} [iface]
       */
      const serializeSlotToSmallcaps = (
        prefix,
        passable,
        iface = undefined,
      ) => {
        let slotIndex;
        if (slotMap.has(passable)) {
          // TODO assert that it's the same iface as before
          slotIndex = slotMap.get(passable);
          assert.typeof(slotIndex, 'number');
          iface = undefined;
        } else {
          const slot = convertValToSlot(passable);
          slotIndex = slots.length;
          slots.push(slot);
          slotMap.set(passable, slotIndex);
        }

        // TODO explore removing this special case
        if (iface === undefined) {
          return `${prefix}${slotIndex}`;
        }
        return `${prefix}${slotIndex}.${iface}`;
      };

      const encodeRemotableToSmallcaps = remotable => {
        const iface = getInterfaceOf(remotable);
        // console.log(`serializeSlot: ${val}`);
        return serializeSlotToSmallcaps('$', remotable, iface);
      };

      const encodePromiseToSmallcaps = promise => {
        return serializeSlotToSmallcaps('?', promise);
      };

      // Only under this assumption are the error encodings the same, so
      // be sure.
      assert(QCLASS === SCLASS);
      const encodeErrorToSmallcaps = encodeErrorToCapData;

      const encodeToSmallcaps = makeEncodeToSmallcaps({
        encodeRemotableToSmallcaps,
        encodePromiseToSmallcaps,
        encodeErrorToSmallcaps,
      });

      const encoded = encodeToSmallcaps(root);
      const smallcapsBody = JSON.stringify(encoded);
      return harden({
        // Valid JSON cannot begin with a '#', so this is a valid signal
        body: `#${smallcapsBody}`,
        slots,
      });
    } else {
      const encodeRemotableToCapData = val => {
        const iface = getInterfaceOf(val);
        // console.log(`serializeSlot: ${val}`);
        return serializeSlot(val, iface);
      };

      const encodeToCapData = makeEncodeToCapData({
        encodeRemotableToCapData,
        encodePromiseToCapData: serializeSlot,
        encodeErrorToCapData,
      });

      const encoded = encodeToCapData(root);
      const body = JSON.stringify(encoded);
      return harden({
        body,
        slots,
      });
    }
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

    const decodeErrorFromCapData = rawTree => {
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
      return harden(error);
    };

    // The current encoding does not give the decoder enough into to distinguish
    // whether a slot represents a promise or a remotable. As an implementation
    // restriction until this is fixed, if either is provided, both must be
    // provided and they must be the same.
    // See https://github.com/Agoric/agoric-sdk/issues/4334
    const decodeRemotableOrPromiseFromCapData = rawTree => {
      const { index, iface } = rawTree;
      const val = unserializeSlot(index, iface);
      return val;
    };

    const decodeRemotableFromSmallcaps = stringEncoding => {
      assert(stringEncoding.startsWith('$'));
      // slots: $slotIndex.iface or $slotIndex
      const i = stringEncoding.indexOf('.');
      const index = Number(stringEncoding.slice(1, i));
      // assert(i > 0, X`${rawTree} is not a valid slot encoding`);
      // i < 0 means there was no iface included
      const iface = i < 0 ? undefined : stringEncoding.slice(i + 1);
      return unserializeSlot(index, iface);
    };

    const decodePromiseFromSmallcaps = stringEncoding => {
      assert(stringEncoding.startsWith('?'));
      // slots: $slotIndex.iface or $slotIndex
      const i = stringEncoding.indexOf('.');
      const index = Number(stringEncoding.slice(1, i));
      // assert(i > 0, X`${rawTree} is not a valid slot encoding`);
      // i < 0 means there was no iface included
      const iface = i < 0 ? undefined : stringEncoding.slice(i + 1);
      return unserializeSlot(index, iface);
    };

    const decodeErrorFromSmallcaps = decodeErrorFromCapData;

    const reviveFromSmallcaps = makeDecodeFromSmallcaps({
      decodeRemotableFromSmallcaps,
      decodePromiseFromSmallcaps,
      decodeErrorFromSmallcaps,
    });

    const reviveFromCapData = makeDecodeFromCapData({
      decodeRemotableFromCapData: decodeRemotableOrPromiseFromCapData,
      decodePromiseFromCapData: decodeRemotableOrPromiseFromCapData,
      decodeErrorFromCapData,
    });

    return harden({
      reviveFromCapData,
      reviveFromSmallcaps,
    });
  };

  /**
   * @type {Unserialize<Slot>}
   */
  const unserialize = data => {
    const { body, slots } = data;
    assert.typeof(
      body,
      'string',
      X`unserialize() given non-capdata (.body is ${body}, not string)`,
    );
    (isArray(data.slots)) ||
      assert.fail(X`unserialize() given non-capdata (.slots are not Array)`);
    const { reviveFromCapData, reviveFromSmallcaps } = makeFullRevive(slots);
    let result;
    // JSON cannot begin with a '#', so this is an unambiguous signal.
    if (body.startsWith('#')) {
      const smallcapsBody = body.slice(1);
      const encoding = harden(JSON.parse(smallcapsBody));
      result = harden(reviveFromSmallcaps(encoding));
    } else {
      const rawTree = harden(JSON.parse(body));
      result = harden(reviveFromCapData(rawTree));
    }
    // See https://github.com/Agoric/agoric-sdk/issues/4337
    // which should be considered fixed once we've completed the switch
    // to smallcaps.
    assertPassable(result);
    return result;
  };

  return harden({
    serialize,
    unserialize,
  });
};
