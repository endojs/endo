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
 * @callback MarshalErrorRecorder
 * @param {Error} err
 * @returns {string|undefined}
 */

/**
 * @typedef {Object} MakeMarshalErrorRecorderOptions
 * @property {string=} marshalName Used to identify sent errors.
 * @property {number=} errorIdNum Ascending numbers staring from here
 * identify the sending of errors relative to this marshal instance.
 * @property {((fmt: string, err: Error) => void)=} log
 * Errors are logged to `log` *after* `assert.note` associates
 * that error with its errorId. Thus, if `marshalSaveError` in turn logs
 * to the normal SES console, which is the default, then the console will
 * show that note showing the associated errorId.
 */

/**
 * @param {MakeMarshalErrorRecorderOptions=} options
 * @returns {MarshalErrorRecorder}
 */
export const makeMarshalErrorRecorder = ({
  marshalName = 'anon-marshal',
  // TODO Temporary hack.
  // See https://github.com/Agoric/agoric-sdk/issues/2780
  errorIdNum = 10000,
  // We prefer that the caller instead log to somewhere hidden
  // to be revealed when correlating with the received error.
  log = (fmt, err) => console.log(fmt, err),
} = {}) => {
  assert.typeof(marshalName, 'string');
  const nextErrorId = () => {
    errorIdNum += 1;
    return `error:${marshalName}#${errorIdNum}`;
  };

  const marshalErrorRecorder = err => {
    // We deliberately do not share the stack, but it would
    // be useful to log the stack locally so someone who has
    // privileged access to the throwing Vat can correlate
    // the problem with the remote Vat that gets this
    // summary. If we do that, we could allocate some random
    // identifier and include it in the message, to help
    // with the correlation.
    const errorId = nextErrorId();
    assert.note(err, X`Sent as ${errorId}`);
    log('Temporary logging of sent error', err);
    return errorId;
  };
  return harden(marshalErrorRecorder);
};
harden(makeMarshalErrorRecorder);

/** @type {MarshalErrorRecorder} */
export const marshalDontSaveError = _err => undefined;
harden(marshalDontSaveError);

/**
 * @typedef {Object} MakeMarshalOptionsAdapter
 * @property {MarshalErrorRecorder=} marshalErrorRecorder
 * @property {'on'|'off'=} errorTagging controls whether serialized errors
 * also carry tagging information, made from `marshalName` and numbers
 * generated (currently by counting) starting at `errorIdNum`. The
 * `errorTagging` option defaults to `'on'`. Serialized
 * errors are also logged to `marshalSaveError` only if tagging is `'on'`.
 * @property {(err: Error) => void=} marshalSaveError If `errorTagging` is
 * `'on'`, then errors serialized by this marshal instance are also
 * logged by calling `marshalSaveError` *after* `assert.note` associates
 * that error with its errorId. Thus, if `marshalSaveError` in turn logs
 * to the normal SES console, which is the default, then the console will
 * show that note showing the associated errorId.
 */

/**
 * @typedef {MakeMarshalErrorRecorderOptions & MakeMarshalOptionsAdapter} MakeMarshalOptions
 */

/**
 * This is an adaptor between the old calling convention and the new, for
 * compat purposes.
 *
 * @param {MakeMarshalOptions=} options
 * @returns {MarshalErrorRecorder}
 */
const makeMarshalRecorderFromMakeMarshalOptions = (options = {}) => {
  const {
    marshalErrorRecorder,
    errorTagging,
    marshalSaveError,
    marshalName,
    errorIdNum,
    log,
  } = options;
  let logger = log;
  if (marshalErrorRecorder) {
    return marshalErrorRecorder;
  }
  if (errorTagging === 'off') {
    return marshalDontSaveError;
  }
  if (marshalSaveError && !log) {
    logger = (_fmt, err) => marshalSaveError(err);
  }
  return makeMarshalErrorRecorder({ marshalName, errorIdNum, log: logger });
};

/**
 * @template Slot
 * @typedef {Object} Marshal
 * @property {Serialize<Slot>} serialize
 * @property {Unserialize<Slot>} unserialize
 */

/**
 * @template Slot
 * @param {ConvertValToSlot<Slot>=} convertValToSlot
 * @param {ConvertSlotToVal<Slot>=} convertSlotToVal
 * @param {MakeMarshalOptions=} options
 * @returns {Marshal<Slot>}
 */
export const makeMarshal = (
  convertValToSlot = defaultValToSlotFn,
  convertSlotToVal = defaultSlotToValFn,
  options = {},
) => {
  const marshalErrorRecorder = makeMarshalRecorderFromMakeMarshalOptions(
    options,
  );
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
    const serializeSlot = (val, iface = undefined) => {
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
    };

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
      const errorId = marshalErrorRecorder(err);
      if (errorId === undefined) {
        return harden({
          [QCLASS]: 'error',
          message: `${err.message}`,
          name: `${err.name}`,
        });
      }
      assert.typeof(errorId, 'string');
      return harden({
        [QCLASS]: 'error',
        errorId,
        message: `${err.message}`,
        name: `${err.name}`,
      });
    };

    const encodeRemotableToCapData = val => {
      const iface = getInterfaceOf(val);
      // console.log(`serializeSlot: ${val}`);
      return serializeSlot(val, iface);
    };

    const encode = makeEncodeToCapData({
      encodeRemotableToCapData,
      encodePromiseToCapData: serializeSlot,
      encodeErrorToCapData,
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

    const unserializeSlot = (index, iface) => {
      if (valMap.has(index)) {
        return valMap.get(index);
      }
      // TODO SECURITY HAZARD: must enfoce that remotable vs promise
      // is according to the encoded string.
      const slot = slots[Number(Nat(index))];
      const val = convertSlotToVal(slot, iface);
      valMap.set(index, val);
      return val;
    };

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
      return error;
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

    const fullRevive = makeDecodeFromCapData({
      decodeRemotableFromCapData: decodeRemotableOrPromiseFromCapData,
      decodePromiseFromCapData: decodeRemotableOrPromiseFromCapData,
      decodeErrorFromCapData,
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
harden(makeMarshal);
