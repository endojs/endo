/// <reference types="ses"/>

// This module is based on the `encodePassable.js` in `@agoric/store`,
// which may migrate here. The main external difference is that
// `encodePassable` goes directly to string, whereas `encodeToCapData`
// encodes to CapData, a JSON-representable data structure, and leaves it to
// the caller (`marshal.js`) to stringify it.

import {
  passStyleOf,
  isErrorLike,
  makeTagged,
  isObject,
  getTag,
  hasOwnPropertyOf,
  assertPassableSymbol,
  nameForPassableSymbol,
  passableSymbolForName,
} from '@endo/pass-style';
import { X, Fail, q } from '@endo/errors';

/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('./types.js').Encoding} Encoding */
/** @typedef {import('@endo/pass-style').Remotable} Remotable */
/** @typedef {import('./types.js').EncodingUnion} EncodingUnion */

const { ownKeys } = Reflect;
const { isArray } = Array;
const {
  getOwnPropertyDescriptors,
  defineProperties,
  is,
  entries,
  fromEntries,
  freeze,
} = Object;

/**
 * Special property name that indicates an encoding that needs special
 * decoding.
 */
const QCLASS = '@qclass';
export { QCLASS };

/**
 * @param {Encoding} encoded
 * @returns {encoded is EncodingUnion}
 */
const hasQClass = encoded => hasOwnPropertyOf(encoded, QCLASS);

/**
 * @param {Encoding} encoded
 * @param {string} qclass
 * @returns {boolean}
 */
const qclassMatches = (encoded, qclass) =>
  isObject(encoded) &&
  !isArray(encoded) &&
  hasQClass(encoded) &&
  encoded[QCLASS] === qclass;

/**
 * @typedef {object} EncodeToCapDataOptions
 * @property {(
 *   remotable: Remotable,
 *   encodeRecur: (p: Passable) => Encoding
 * ) => Encoding} [encodeRemotableToCapData]
 * @property {(
 *   promise: Promise,
 *   encodeRecur: (p: Passable) => Encoding
 * ) => Encoding} [encodePromiseToCapData]
 * @property {(
 *   error: Error,
 *   encodeRecur: (p: Passable) => Encoding
 * ) => Encoding} [encodeErrorToCapData]
 */

const dontEncodeRemotableToCapData = rem => Fail`remotable unexpected: ${rem}`;

const dontEncodePromiseToCapData = prom => Fail`promise unexpected: ${prom}`;

const dontEncodeErrorToCapData = err => Fail`error object unexpected: ${err}`;

/**
 * @param {EncodeToCapDataOptions} [encodeOptions]
 * @returns {(passable: Passable) => Encoding}
 */
export const makeEncodeToCapData = (encodeOptions = {}) => {
  const {
    encodeRemotableToCapData = dontEncodeRemotableToCapData,
    encodePromiseToCapData = dontEncodePromiseToCapData,
    encodeErrorToCapData = dontEncodeErrorToCapData,
  } = encodeOptions;

  /**
   * Must encode `val` into plain JSON data *canonically*, such that
   * `JSON.stringify(encode(v1)) === JSON.stringify(encode(v1))`. For most
   * encodings, the order of properties of each node of the output
   * structure is determined by the algorithm below without special
   * arrangement, usually by being expressed directly as an object literal.
   * The exception is copyRecords, whose natural enumeration order
   * can differ between copyRecords that our distributed object semantics
   * considers to be equivalent.
   * Since, for each copyRecord, we only accept string property names,
   * not symbols, we can canonically sort the names first.
   * JSON.stringify will then visit these in that sorted order.
   *
   * Encoding with a canonical-JSON encoder would also solve this canonicalness
   * problem in a more modular and encapsulated manner. Note that the
   * actual order produced here, though it agrees with canonical-JSON on
   * copyRecord property ordering, differs from canonical-JSON as a whole
   * in that the other record properties are visited in the order in which
   * they are literally written below. TODO perhaps we should indeed switch
   * to a canonical JSON encoder, and not delicately depend on the order
   * in which these object literals are written.
   *
   * Readers must not care about this order anyway. We impose this requirement
   * mainly to reduce non-determinism exposed outside a vat.
   *
   * @param {Passable} passable
   * @returns {Encoding} except that `encodeToCapData` does not generally
   * `harden` this result before returning. Rather, `encodeToCapData` is not
   * directly exposed.
   * What's exposed instead is a wrapper that freezes the output before
   * returning. If this turns out to impede static analysis for `harden` safety,
   * we can always put the (now redundant) hardens back in. They don't hurt.
   */
  const encodeToCapDataRecur = passable => {
    // First we handle all primitives. Some can be represented directly as
    // JSON, and some must be encoded as [QCLASS] composites.
    const passStyle = passStyleOf(passable);
    switch (passStyle) {
      case 'null':
      case 'boolean':
      case 'string': {
        // pass through to JSON
        return passable;
      }
      case 'undefined': {
        return { [QCLASS]: 'undefined' };
      }
      case 'number': {
        // Special-case numbers with no digit-based representation.
        if (Number.isNaN(passable)) {
          return { [QCLASS]: 'NaN' };
        } else if (passable === Infinity) {
          return { [QCLASS]: 'Infinity' };
        } else if (passable === -Infinity) {
          return { [QCLASS]: '-Infinity' };
        }
        // Pass through everything else, replacing -0 with 0.
        return is(passable, -0) ? 0 : passable;
      }
      case 'bigint': {
        return {
          [QCLASS]: 'bigint',
          digits: String(passable),
        };
      }
      case 'symbol': {
        assertPassableSymbol(passable);
        const name = /** @type {string} */ (nameForPassableSymbol(passable));
        return {
          [QCLASS]: 'symbol',
          name,
        };
      }
      case 'copyRecord': {
        if (hasOwnPropertyOf(passable, QCLASS)) {
          // Hilbert hotel
          const { [QCLASS]: qclassValue, ...rest } = passable;
          /** @type {Encoding} */
          const result = {
            [QCLASS]: 'hilbert',
            original: encodeToCapDataRecur(qclassValue),
          };
          if (ownKeys(rest).length >= 1) {
            // We harden the entire capData encoding before we return it.
            // `encodeToCapData` requires that its input be Passable, and
            // therefore hardened.
            // The `freeze` here is needed anyway, because the `rest` is
            // freshly constructed by the `...` above, and we're using it
            // as imput in another call to `encodeToCapData`.
            result.rest = encodeToCapDataRecur(freeze(rest));
          }
          return result;
        }
        // Currently copyRecord allows only string keys so this will
        // work. If we allow sortable symbol keys, this will need to
        // become more interesting.
        const names = ownKeys(passable).sort();
        return fromEntries(
          names.map(name => [name, encodeToCapDataRecur(passable[name])]),
        );
      }
      case 'copyArray': {
        return passable.map(encodeToCapDataRecur);
      }
      case 'tagged': {
        return {
          [QCLASS]: 'tagged',
          tag: getTag(passable),
          payload: encodeToCapDataRecur(passable.payload),
        };
      }
      case 'remotable': {
        const encoded = encodeRemotableToCapData(
          passable,
          encodeToCapDataRecur,
        );
        if (qclassMatches(encoded, 'slot')) {
          return encoded;
        }
        // `throw` is noop since `Fail` throws. But linter confused
        throw Fail`internal: Remotable encoding must be an object with ${q(
          QCLASS,
        )} ${q('slot')}: ${encoded}`;
      }
      case 'promise': {
        const encoded = encodePromiseToCapData(passable, encodeToCapDataRecur);
        if (qclassMatches(encoded, 'slot')) {
          return encoded;
        }
        throw Fail`internal: Promise encoding must be an object with ${q(
          QCLASS,
          'slot',
        )}: ${encoded}`;
      }
      case 'error': {
        const encoded = encodeErrorToCapData(passable, encodeToCapDataRecur);
        if (qclassMatches(encoded, 'error')) {
          return encoded;
        }
        throw Fail`internal: Error encoding must be an object with ${q(
          QCLASS,
          'error',
        )}: ${encoded}`;
      }
      default: {
        throw assert.fail(
          X`internal: Unrecognized passStyle ${q(passStyle)}`,
          TypeError,
        );
      }
    }
  };
  const encodeToCapData = passable => {
    if (isErrorLike(passable)) {
      // We pull out this special case to accommodate errors that are not
      // valid Passables. For example, because they're not frozen.
      // The special case can only ever apply at the root, and therefore
      // outside the recursion, since an error could only be deeper in
      // a passable structure if it were passable.
      //
      // We pull out this special case because, for these errors, we're much
      // more interested in reporting whatever diagnostic information they
      // carry than we are about reporting problems encountered in reporting
      // this information.
      return harden(encodeErrorToCapData(passable, encodeToCapDataRecur));
    }
    return harden(encodeToCapDataRecur(passable));
  };
  return harden(encodeToCapData);
};
harden(makeEncodeToCapData);

/**
 * @typedef {object} DecodeOptions
 * @property {(
 *   encodedRemotable: Encoding,
 *   decodeRecur: (e: Encoding) => Passable
 * ) => (Promise|Remotable)} [decodeRemotableFromCapData]
 * @property {(
 *   encodedPromise: Encoding,
 *   decodeRecur: (e: Encoding) => Passable
 * ) => (Promise|Remotable)} [decodePromiseFromCapData]
 * @property {(
 *   encodedError: Encoding,
 *   decodeRecur: (e: Encoding) => Passable
 * ) => Error} [decodeErrorFromCapData]
 */

const dontDecodeRemotableOrPromiseFromCapData = slotEncoding =>
  Fail`remotable or promise unexpected: ${slotEncoding}`;
const dontDecodeErrorFromCapData = errorEncoding =>
  Fail`error unexpected: ${errorEncoding}`;

/**
 * The current encoding does not give the decoder enough into to distinguish
 * whether a slot represents a promise or a remotable. As an implementation
 * restriction until this is fixed, if either is provided, both must be
 * provided and they must be the same.
 *
 * This seems like the best starting point to incrementally evolve to an
 * API where these can reliably differ.
 * See https://github.com/Agoric/agoric-sdk/issues/4334
 *
 * @param {DecodeOptions} [decodeOptions]
 * @returns {(encoded: Encoding) => Passable}
 */
export const makeDecodeFromCapData = (decodeOptions = {}) => {
  const {
    decodeRemotableFromCapData = dontDecodeRemotableOrPromiseFromCapData,
    decodePromiseFromCapData = dontDecodeRemotableOrPromiseFromCapData,
    decodeErrorFromCapData = dontDecodeErrorFromCapData,
  } = decodeOptions;

  decodeRemotableFromCapData === decodePromiseFromCapData ||
    Fail`An implementation restriction for now: If either decodeRemotableFromCapData or decodePromiseFromCapData is provided, both must be provided and they must be the same: ${q(
      decodeRemotableFromCapData,
    )} vs ${q(decodePromiseFromCapData)}`;

  /**
   * `decodeFromCapData` may rely on `jsonEncoded` being the result of a
   * plain call to JSON.parse. However, it *cannot* rely on `jsonEncoded`
   * having been produced by JSON.stringify on the output of `encodeToCapData`
   * above, i.e., `decodeFromCapData` cannot rely on `jsonEncoded` being a
   * valid marshalled representation. Rather, `decodeFromCapData` must
   * validate that.
   *
   * @param {Encoding} jsonEncoded must be hardened
   */
  const decodeFromCapData = jsonEncoded => {
    if (!isObject(jsonEncoded)) {
      // primitives pass through
      return jsonEncoded;
    }
    if (isArray(jsonEncoded)) {
      return jsonEncoded.map(encodedVal => decodeFromCapData(encodedVal));
    } else if (hasQClass(jsonEncoded)) {
      const qclass = jsonEncoded[QCLASS];
      typeof qclass === 'string' ||
        Fail`invalid ${q(QCLASS)} typeof ${q(typeof qclass)}`;
      switch (qclass) {
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
          typeof digits === 'string' ||
            Fail`invalid digits typeof ${q(typeof digits)}`;
          return BigInt(digits);
        }
        case '@@asyncIterator': {
          // Deprecated qclass. TODO make conditional
          // on environment variable. Eventually remove, but after confident
          // that there are no more supported senders.
          //
          return Symbol.asyncIterator;
        }
        case 'symbol': {
          const { name } = jsonEncoded;
          return passableSymbolForName(name);
        }
        case 'tagged': {
          const { tag, payload } = jsonEncoded;
          return makeTagged(tag, decodeFromCapData(payload));
        }
        case 'slot': {
          // See note above about how the current encoding cannot reliably
          // distinguish which we should call, so in the non-default case
          // both must be the same and it doesn't matter which we call.
          const decoded = decodeRemotableFromCapData(
            jsonEncoded,
            decodeFromCapData,
          );
          // BEWARE: capdata does not check that `decoded` is
          // a promise or a remotable, since that would break some
          // capdata clients. We are deprecating capdata, and these clients
          // will need to update before switching to smallcaps.
          return decoded;
        }
        case 'error': {
          const decoded = decodeErrorFromCapData(
            jsonEncoded,
            decodeFromCapData,
          );
          if (passStyleOf(decoded) === 'error') {
            return decoded;
          }
          throw Fail`internal: decodeErrorFromCapData option must return an error: ${decoded}`;
        }
        case 'hilbert': {
          const { original, rest } = jsonEncoded;
          hasOwnPropertyOf(jsonEncoded, 'original') ||
            Fail`Invalid Hilbert Hotel encoding ${jsonEncoded}`;
          // Don't harden since we're not done mutating it
          const result = { [QCLASS]: decodeFromCapData(original) };
          if (hasOwnPropertyOf(jsonEncoded, 'rest')) {
            const isNonEmptyObject =
              typeof rest === 'object' &&
              rest !== null &&
              ownKeys(rest).length >= 1;
            if (!isNonEmptyObject) {
              throw Fail`Rest encoding must be a non-empty object: ${rest}`;
            }
            const restObj = decodeFromCapData(rest);
            // TODO really should assert that `passStyleOf(rest)` is
            // `'copyRecord'` but we'd have to harden it and it is too
            // early to do that.
            !hasOwnPropertyOf(restObj, QCLASS) ||
              Fail`Rest must not contain its own definition of ${q(QCLASS)}`;
            defineProperties(result, getOwnPropertyDescriptors(restObj));
          }
          return result;
        }
        // @ts-expect-error This is the error case we're testing for
        case 'ibid': {
          throw Fail`The capData protocol no longer supports ${q(QCLASS)} ${q(
            qclass,
          )}`;
        }
        default: {
          throw assert.fail(
            X`unrecognized ${q(QCLASS)} ${q(qclass)}`,
            TypeError,
          );
        }
      }
    } else {
      assert(typeof jsonEncoded === 'object' && jsonEncoded !== null);
      const decodeEntry = ([name, encodedVal]) => {
        typeof name === 'string' ||
          Fail`Property ${q(name)} of ${jsonEncoded} must be a string`;
        return [name, decodeFromCapData(encodedVal)];
      };
      const decodedEntries = entries(jsonEncoded).map(decodeEntry);
      return fromEntries(decodedEntries);
    }
  };
  return harden(decodeFromCapData);
};
