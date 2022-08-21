// @ts-check

/// <reference types="ses"/>

// This module is based on the `encodeParssable.js` in `@agoric/store`,
// which may migrate here. The main external difference is that
// `encodePassable` goes directly to string, whereas `encodeToJSON`
// encodes to a raw JSON tree and leaves to the caller (`marshal.js`)
// to stringify it.

import { passStyleOf } from './passStyleOf.js';

import { ErrorHelper } from './helpers/error.js';
import { makeTagged } from './makeTagged.js';
import { isObject, getTag } from './helpers/passStyle-helpers.js';
import {
  assertPassableSymbol,
  nameForPassableSymbol,
  passableSymbolForName,
} from './helpers/symbol.js';

/** @typedef {import('./types.js').MakeMarshalOptions} MakeMarshalOptions */
/** @template Slot @typedef {import('./types.js').ConvertSlotToVal<Slot>} ConvertSlotToVal */
/** @template Slot @typedef {import('./types.js').ConvertValToSlot<Slot>} ConvertValToSlot */
/** @template Slot @typedef {import('./types.js').Serialize<Slot>} Serialize */
/** @template Slot @typedef {import('./types.js').Unserialize<Slot>} Unserialize */
/** @typedef {import('./types.js').Passable} Passable */
/** @typedef {import('./types.js').InterfaceSpec} InterfaceSpec */
/** @typedef {import('./types.js').Encoding} Encoding */
/** @typedef {import('./types.js').Remotable} Remotable */

const { ownKeys } = Reflect;
const { isArray } = Array;
const {
  getOwnPropertyDescriptors,
  defineProperties,
  is,
  fromEntries,
  freeze,
} = Object;
const { details: X, quote: q } = assert;

/**
 * Special property name that indicates an encoding that needs special
 * decoding.
 */
const QCLASS = '@qclass';
export { QCLASS };

/**
 * @typedef {object} EncodeToJSONOptionsRecord
 * @property {(remotable: object) => Encoding} encodeRemotableToJSON
 * @property {(promise: object) => Encoding} encodePromiseToJSON
 * @property {(error: object) => Encoding} encodeErrorToJSON
 */

/**
 * @typedef {Partial<EncodeToJSONOptionsRecord>} EncodeToJSONOptions
 */

/**
 * @param {EncodeToJSONOptions=} encodeOptions
 * @returns {(passable: Passable) => Encoding}
 */
export const makeEncodeToJSON = ({
  encodeRemotableToJSON = rem => assert.fail(X`remotable unexpected: ${rem}`),
  encodePromiseToJSON = prom => assert.fail(X`promise unexpected: ${prom}`),
  encodeErrorToJSON = err => assert.fail(X`error unexpected: ${err}`),
} = {}) => {
  /**
   * Must encode `val` into plain JSON data *canonically*, such that
   * `JSON.stringify(encode(v1)) === JSON.stringify(encode(v1))`
   * For each copyRecord, we only accept string property names,
   * not symbols. The encoded form the sort
   * order of these names must be the same as their enumeration
   * order, so a `JSON.stringify` of the encoded form agrees with
   * a canonical-json stringify of the encoded form.
   *
   * @param {Passable} passable
   * @returns {Encoding}
   */
  const encodeToJSON = passable => {
    if (ErrorHelper.canBeValid(passable)) {
      return encodeErrorToJSON(passable);
    }
    // First we handle all primitives. Some can be represented directly as
    // JSON, and some must be encoded as [QCLASS] composites.
    const passStyle = passStyleOf(passable);
    switch (passStyle) {
      case 'null': {
        return null;
      }
      case 'undefined': {
        return harden({ [QCLASS]: 'undefined' });
      }
      case 'string':
      case 'boolean': {
        return passable;
      }
      case 'number': {
        if (Number.isNaN(passable)) {
          return harden({ [QCLASS]: 'NaN' });
        }
        if (is(passable, -0)) {
          return 0;
        }
        if (passable === Infinity) {
          return harden({ [QCLASS]: 'Infinity' });
        }
        if (passable === -Infinity) {
          return harden({ [QCLASS]: '-Infinity' });
        }
        return passable;
      }
      case 'bigint': {
        return harden({
          [QCLASS]: 'bigint',
          digits: String(passable),
        });
      }
      case 'symbol': {
        assertPassableSymbol(passable);
        const name = /** @type {string} */ (nameForPassableSymbol(passable));
        return harden({
          [QCLASS]: 'symbol',
          name,
        });
      }
      case 'copyRecord': {
        if (QCLASS in passable) {
          // Hilbert hotel
          const { [QCLASS]: qclassValue, ...rest } = passable;
          if (ownKeys(rest).length === 0) {
            /** @type {Encoding} */
            const result = harden({
              [QCLASS]: 'hilbert',
              original: encodeToJSON(qclassValue),
            });
            return result;
          } else {
            /** @type {Encoding} */
            const result = harden({
              [QCLASS]: 'hilbert',
              original: encodeToJSON(qclassValue),
              // See https://github.com/Agoric/agoric-sdk/issues/4313
              rest: encodeToJSON(freeze(rest)),
            });
            return result;
          }
        }
        // Currently copyRecord allows only string keys so this will
        // work. If we allow sortable symbol keys, this will need to
        // become more interesting.
        const names = ownKeys(passable).sort();
        return fromEntries(
          names.map(name => [name, encodeToJSON(passable[name])]),
        );
      }
      case 'copyArray': {
        return passable.map(encodeToJSON);
      }
      case 'tagged': {
        /** @type {Encoding} */
        const result = harden({
          [QCLASS]: 'tagged',
          tag: getTag(passable),
          payload: encodeToJSON(passable.payload),
        });
        return result;
      }
      case 'remotable': {
        return encodeRemotableToJSON(passable);
      }
      case 'error': {
        return encodeErrorToJSON(passable);
      }
      case 'promise': {
        return encodePromiseToJSON(passable);
      }
      default: {
        assert.fail(X`unrecognized passStyle ${q(passStyle)}`, TypeError);
      }
    }
  };
  return harden(encodeToJSON);
};
harden(makeEncodeToJSON);

/**
 * @typedef {object} DecodeOptionsRecord
 * @property {(encodedRemotable: Encoding) => (Promise|Remotable)} decodeRemotableFromJSON
 * @property {(encodedPromise: Encoding) => (Promise|Remotable)} decodePromiseFromJSON
 * @property {(encodedError: Encoding) => Error} decodeErrorFromJSON
 */

/**
 * @typedef {Partial<DecodeOptionsRecord>} DecodeOptions
 */

/**
 * @param {DecodeOptions=} decodeOptions
 * @returns {(encoded: Encoding) => Passable}
 */
export const makeDecodeFromJSON = ({
  decodeRemotableFromJSON = rem => assert.fail(X`remotable unexpected: ${rem}`),
  decodePromiseFromJSON = rem => assert.fail(X`promise unexpected: ${rem}`),
  decodeErrorFromJSON = err => assert.fail(X`error unexpected: ${err}`),
} = {}) => {
  /**
   * We stay close to the algorithm at
   * https://tc39.github.io/ecma262/#sec-json.parse , where
   * fullRevive(harden(JSON.parse(str))) is like JSON.parse(str, revive))
   * for a similar reviver. But with the following differences:
   *
   * Rather than pass a reviver to JSON.parse, we first call a plain
   * (one argument) JSON.parse to get rawTree, and then post-process
   * the rawTree with fullRevive. The kind of revive function
   * handled by JSON.parse only does one step in post-order, with
   * JSON.parse doing the recursion. By contrast, fullParse does its
   * own recursion in the same pre-order in which the replacer visited them.
   *
   * In order to break cycles, the potentially cyclic objects are
   * not frozen during the recursion. Rather, the whole graph is
   * hardened before being returned. Error objects are not
   * potentially recursive, and so may be harmlessly hardened when
   * they are produced.
   *
   * fullRevive can produce properties whose value is undefined,
   * which a JSON.parse on a reviver cannot do. If a reviver returns
   * undefined to JSON.parse, JSON.parse will delete the property
   * instead.
   *
   * fullRevive creates and returns a new graph, rather than
   * modifying the original tree in place.
   *
   * fullRevive may rely on rawTree being the result of a plain call
   * to JSON.parse. However, it *cannot* rely on it having been
   * produced by JSON.stringify on the replacer above, i.e., it
   * cannot rely on it being a valid marshalled
   * representation. Rather, fullRevive must validate that.
   *
   * @param {Encoding} jsonEncoded must be hardened
   */
  const decodeFromJSON = jsonEncoded => {
    if (!isObject(jsonEncoded)) {
      // primitives pass through
      return jsonEncoded;
    }
    // Assertions of the above to narrow the type.
    assert.typeof(jsonEncoded, 'object');
    assert(jsonEncoded !== null);
    if (QCLASS in jsonEncoded) {
      const qclass = jsonEncoded[QCLASS];
      assert.typeof(
        qclass,
        'string',
        X`invalid qclass typeof ${q(typeof qclass)}`,
      );
      assert(!isArray(jsonEncoded));
      // Switching on `jsonEncoded[QCLASS]` (or anything less direct, like
      // `qclass`) does not discriminate jsonEncoded in typescript@4.2.3 and
      // earlier.
      switch (jsonEncoded['@qclass']) {
        // Encoding of primitives not handled by JSON
        case 'undefined': {
          return undefined;
        }
        case 'NaN': {
          return NaN;
        }
        case 'Infinity': {
          return Infinity;
        }
        case '-Infinity': {
          return -Infinity;
        }
        case 'bigint': {
          const { digits } = jsonEncoded;
          assert.typeof(
            digits,
            'string',
            X`invalid digits typeof ${q(typeof digits)}`,
          );
          return BigInt(digits);
        }
        case '@@asyncIterator': {
          // Deprectated qclass. TODO make conditional
          // on environment variable. Eventually remove, but after confident
          // that there are no more supported senders.
          return Symbol.asyncIterator;
        }
        case 'symbol': {
          const { name } = jsonEncoded;
          return passableSymbolForName(name);
        }

        case 'tagged': {
          const { tag, payload } = jsonEncoded;
          return makeTagged(tag, decodeFromJSON(payload));
        }

        case 'error': {
          return decodeErrorFromJSON(jsonEncoded);
        }

        case 'slot': {
          if ('iface' in jsonEncoded) {
            return decodeRemotableFromJSON(jsonEncoded);
          } else {
            return decodePromiseFromJSON(jsonEncoded);
          }
        }

        case 'hilbert': {
          const { original, rest } = jsonEncoded;
          assert(
            'original' in jsonEncoded,
            X`Invalid Hilbert Hotel encoding ${jsonEncoded}`,
          );
          // Don't harden since we're not done mutating it
          const result = { [QCLASS]: decodeFromJSON(original) };
          if ('rest' in jsonEncoded) {
            assert(rest !== undefined, X`Rest encoding must not be undefined`);
            const restObj = decodeFromJSON(rest);
            // TODO really should assert that `passStyleOf(rest)` is
            // `'copyRecord'` but we'd have to harden it and it is too
            // early to do that.
            assert(
              !(QCLASS in restObj),
              X`Rest must not contain its own definition of ${q(QCLASS)}`,
            );
            defineProperties(result, getOwnPropertyDescriptors(restObj));
          }
          return result;
        }

        default: {
          assert(
            // @ts-expect-error exhaustive check should make condition true
            qclass !== 'ibid',
            X`The protocol no longer supports ibid encoding: ${jsonEncoded}.`,
          );
          assert.fail(X`unrecognized ${q(QCLASS)} ${q(qclass)}`, TypeError);
        }
      }
    } else if (isArray(jsonEncoded)) {
      const result = [];
      const { length } = jsonEncoded;
      for (let i = 0; i < length; i += 1) {
        result[i] = decodeFromJSON(jsonEncoded[i]);
      }
      return result;
    } else {
      const result = {};
      for (const name of ownKeys(jsonEncoded)) {
        assert.typeof(
          name,
          'string',
          X`Property ${name} of ${jsonEncoded} must be a string`,
        );
        result[name] = decodeFromJSON(jsonEncoded[name]);
      }
      return result;
    }
  };
  return harden(decodeFromJSON);
};
