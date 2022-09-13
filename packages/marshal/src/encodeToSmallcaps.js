// @ts-check

/// <reference types="ses"/>

// This module is based on the `encodePassable.js` in `@agoric/store`,
// which may migrate here. The main external difference is that
// `encodePassable` goes directly to string, whereas `encodeToSmallcaps`
// encodes to Smallcaps, a JSON-representable data structure, and leaves it to
// the caller (`marshal.js`) to stringify it.

import { passStyleOf } from './passStyleOf.js';

import { ErrorHelper } from './helpers/error.js';
import { makeTagged } from './makeTagged.js';
import {
  isObject,
  getTag,
  hasOwnPropertyOf,
} from './helpers/passStyle-helpers.js';
import {
  assertPassableSymbol,
  nameForPassableSymbol,
  passableSymbolForName,
} from './helpers/symbol.js';

/** @typedef {import('./types.js').Passable} Passable */
/** @typedef {import('./types.js').Remotable} Remotable */
// @typedef {import('./types.js').SmallcapsEncoding} SmallcapsEncoding */
// @typedef {import('./types.js').SmallcapsEncodingUnion} SmallcapsEncodingUnion */
/** @typedef {any} SmallcapsEncoding */
/** @typedef {any} SmallcapsEncodingUnion */

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
export const SCLASS = '@qclass';

/**
 * `'` - escaped string
 * `+` - non-negative bigint
 * `-` - negative bigint
 * `#` - constant
 * `@` - symbol
 * `$` - remotable
 * `?` - promise
 */
const SpecialChars = `'+-#@$?`;

/**
 * @param {SmallcapsEncoding} encoded
 * @returns {encoded is SmallcapsEncodingUnion}
 */
const hasSClass = encoded => hasOwnPropertyOf(encoded, SCLASS);

/**
 * @typedef {object} EncodeToSmallcapsOptions
 * @property {(remotable: object) => SmallcapsEncoding} [encodeRemotableToSmallcaps]
 * @property {(promise: object) => SmallcapsEncoding} [encodePromiseToSmallcaps]
 * @property {(error: object) => SmallcapsEncoding} [encodeErrorToSmallcaps]
 */

const dontEncodeRemotableToSmallcaps = rem =>
  assert.fail(X`remotable unexpected: ${rem}`);

const dontEncodePromiseToSmallcaps = prom =>
  assert.fail(X`promise unexpected: ${prom}`);

const dontEncodeErrorToSmallcaps = err =>
  assert.fail(X`error object unexpected: ${q(err)}`);

/**
 * @param {EncodeToSmallcapsOptions=} encodeOptions
 * @returns {(passable: Passable) => SmallcapsEncoding}
 */
export const makeEncodeToSmallcaps = ({
  encodeRemotableToSmallcaps = dontEncodeRemotableToSmallcaps,
  encodePromiseToSmallcaps = dontEncodePromiseToSmallcaps,
  encodeErrorToSmallcaps = dontEncodeErrorToSmallcaps,
} = {}) => {
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
   * SmallcapsEncoding with a canonical-JSON encoder would also solve
   * this canonicalness
   * problem in a more modular and encapsulated manner. Note that the
   * actual order produced here, though it agrees with canonical-JSON on
   * copyRecord property ordering, differs from canonical-JSON as a whole
   * in that the other record properties are visited in the order in which
   * they are literally written below. TODO perhaps we should indeed switch
   * to a canonical JSON encoder, and not delicatetly depend on the order
   * in which these object literals are written.
   *
   * Readers must not care about this order anyway. We impose this requirement
   * mainly to reduce non-determinism exposed outside a vat.
   *
   * @param {Passable} passable
   * @returns {SmallcapsEncoding} except that `encodeToSmallcaps` does not generally
   * `harden` this result before returning. Rather, `encodeToSmallcaps` is not
   * directly exposed.
   * What's exposed instead is a wrapper that freezes the output before
   * returning. If this turns out to impede static analysis for `harden` safety,
   * we can always put the (now redundant) hardens back in. They don't hurt.
   */
  const encodeToSmallcapsRecur = passable => {
    // First we handle all primitives. Some can be represented directly as
    // JSON, and some must be encoded into smallcaps strings.
    const passStyle = passStyleOf(passable);
    switch (passStyle) {
      case 'null':
      case 'boolean': {
        return passable;
      }
      case 'string': {
        if (passable !== '' && SpecialChars.includes(passable[0])) {
          return `'${passable}`;
        }
        return passable;
      }
      case 'symbol': {
        assertPassableSymbol(passable);
        const name = /** @type {string} */ (nameForPassableSymbol(passable));
        return `@${name}`;
      }
      case 'undefined': {
        return '#undefined';
      }
      case 'number': {
        if (Number.isNaN(passable)) {
          return '#NaN';
        }
        if (is(passable, -0)) {
          return 0;
        }
        if (passable === Infinity) {
          return '#Infinity';
        }
        if (passable === -Infinity) {
          return '#-Infinity';
        }
        return passable;
      }
      case 'bigint': {
        const str = String(passable);
        return passable < 0n ? `${str}n` : `+${str}n`;
      }
      case 'copyRecord': {
        if (hasSClass(passable)) {
          // Hilbert hotel
          const { [SCLASS]: sclassValue, ...rest } = passable;
          /** @type {SmallcapsEncoding} */
          const result = {
            [SCLASS]: 'hilbert',
            original: encodeToSmallcapsRecur(sclassValue),
          };
          if (ownKeys(rest).length >= 1) {
            // We harden the entire smallcaps encoding before we return it.
            // `encodeToSmallcaps` requires that its input be Passable, and
            // therefore hardened.
            // The `freeze` here is needed anyway, because the `rest` is
            // freshly constructed by the `...` above, and we're using it
            // as imput in another call to `encodeToSmallcaps`.
            result.rest = encodeToSmallcapsRecur(freeze(rest));
          }
          return result;
        }
        // Currently copyRecord allows only string keys so this will
        // work. If we allow sortable symbol keys, this will need to
        // become more interesting.
        const names = ownKeys(passable).sort();
        return fromEntries(
          names.map(name => [name, encodeToSmallcapsRecur(passable[name])]),
        );
      }
      case 'copyArray': {
        return passable.map(encodeToSmallcapsRecur);
      }
      case 'tagged': {
        return {
          [SCLASS]: 'tagged',
          tag: getTag(passable),
          payload: encodeToSmallcapsRecur(passable.payload),
        };
      }
      case 'remotable': {
        const result = encodeRemotableToSmallcaps(passable);
        if (typeof result === 'string' && result.startsWith('$')) {
          return result;
        }
        assert.fail(
          X`internal: Remotable encoding must start with "$": ${result}`,
        );
      }
      case 'promise': {
        const result = encodePromiseToSmallcaps(passable);
        if (typeof result === 'string' && result.startsWith('?')) {
          return result;
        }
        assert.fail(
          X`internal: Promise encoding must start with "?": ${result}`,
        );
      }
      case 'error': {
        const result = encodeErrorToSmallcaps(passable);
        if (typeof result === 'object' && result[SCLASS] === 'error') {
          return result;
        }
        assert.fail(
          X`internal: Error encoding must use ${q(SCLASS)} "error": ${result}`,
        );
      }
      default: {
        assert.fail(X`unrecognized passStyle ${q(passStyle)}`, TypeError);
      }
    }
  };
  const encodeToSmallcaps = passable => {
    if (ErrorHelper.canBeValid(passable, x => x)) {
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
      return harden(encodeErrorToSmallcaps(passable));
    }
    return harden(encodeToSmallcapsRecur(passable));
  };
  return harden(encodeToSmallcaps);
};
harden(makeEncodeToSmallcaps);

/**
 * @typedef {object} DecodeFromSmallcapsOptions
 * @property {(encodedRemotable: SmallcapsEncoding
 * ) => Remotable} [decodeRemotableFromSmallcaps]
 * @property {(encodedPromise: SmallcapsEncoding
 * ) => Promise} [decodePromiseFromSmallcaps]
 * @property {(encodedError: SmallcapsEncoding
 * ) => Error} [decodeErrorFromSmallcaps]
 */

const dontDecodeRemotableFromSmallcaps = encoding =>
  assert.fail(X`remotable unexpected: ${encoding}`);
const dontDecodePromiseFromSmallcaps = encoding =>
  assert.fail(X`promise unexpected: ${encoding}`);
const dontDecodeErrorFromSmallcaps = encoding =>
  assert.fail(X`error unexpected: ${q(encoding)}`);

/**
 * @param {DecodeFromSmallcapsOptions=} decodeOptions
 * @returns {(encoded: SmallcapsEncoding) => Passable}
 */
export const makeDecodeFromSmallcaps = ({
  decodeRemotableFromSmallcaps = dontDecodeRemotableFromSmallcaps,
  decodePromiseFromSmallcaps = dontDecodePromiseFromSmallcaps,
  decodeErrorFromSmallcaps = dontDecodeErrorFromSmallcaps,
} = {}) => {
  /**
   * `decodeFromSmallcaps` may rely on `encoding` being the result of a
   * plain call to JSON.parse. However, it *cannot* rely on `encoding`
   * having been produced by JSON.stringify on the output of `encodeToSmallcaps`
   * above, i.e., `decodeFromSmallcaps` cannot rely on `encoding` being a
   * valid marshalled representation. Rather, `decodeFromSmallcaps` must
   * validate that.
   *
   * @param {SmallcapsEncoding} encoding must be hardened
   */
  const decodeFromSmallcaps = encoding => {
    if (typeof encoding === 'string') {
      switch (encoding.charAt(0)) {
        case "'": {
          // un-hilbert-ify the string
          return encoding.slice(1);
        }
        case '@': {
          return passableSymbolForName(encoding.slice(1));
        }
        case '#': {
          switch (encoding) {
            case '#undefined': {
              return undefined;
            }
            case '#NaN': {
              return NaN;
            }
            case '#Infinity': {
              return Infinity;
            }
            case '#-Infinity': {
              return -Infinity;
            }
            default: {
              assert.fail(X`unknown constant "${q(encoding)}"`, TypeError);
            }
          }
        }
        case '+':
        case '-': {
          const last = encoding.length - 1;
          assert(
            encoding[last] === 'n',
            X`Encoded bigint must start with "+" or "-" and end with "n": ${encoding}`,
          );
          return BigInt(encoding.slice(0, last));
        }
        case '$': {
          const result = decodeRemotableFromSmallcaps(encoding);
          if (passStyleOf(result) !== 'remotable') {
            assert.fail(
              X`internal: decodeRemotableFromSmallcaps option must return a remotable: ${result}`,
            );
          }
          return result;
        }
        case '?': {
          const result = decodePromiseFromSmallcaps(encoding);
          if (passStyleOf(result) !== 'promise') {
            assert.fail(
              X`internal: decodePromiseFromSmallcaps option must return a promise: ${result}`,
            );
          }
          return result;
        }
        default: {
          return encoding;
        }
      }
    }

    if (
      typeof encoding === 'number' ||
      typeof encoding === 'boolean' ||
      encoding == null
    ) {
      // remaining primitives pass through
      return encoding;
    }
    isObject(encoding) ||
      assert.fail(X`invalid encoding, unexpected type ${typeof encoding}`);

    if (isArray(encoding)) {
      const result = [];
      const { length } = encoding;
      for (let i = 0; i < length; i += 1) {
        result[i] = decodeFromSmallcaps(encoding[i]);
      }
      return result;
    }
    if (hasSClass(encoding)) {
      /** @type {string} */
      const sclass = encoding[SCLASS];
      if (typeof sclass !== 'string') {
        assert.fail(X`invalid sclass typeof ${q(typeof sclass)}`);
      }
      switch (sclass) {
        // SmallcapsEncoding of primitives not handled by JSON
        case 'tagged': {
          // Using @ts-ignore rather than @ts-expect-error below because
          // with @ts-expect-error I get a red underline in vscode, but
          // without it I get errors from `yarn lint`.
          // @ts-ignore inadequate type inference
          // See https://github.com/endojs/endo/pull/1259#discussion_r954561901
          const { tag, payload } = encoding;
          return makeTagged(tag, decodeFromSmallcaps(payload));
        }

        case 'error': {
          const result = decodeErrorFromSmallcaps(encoding);
          if (passStyleOf(result) !== 'error') {
            assert.fail(
              X`internal: decodeErrorFromSmallcaps option must return an error: ${result}`,
            );
          }
          return result;
        }

        case 'hilbert': {
          // Using @ts-ignore rather than @ts-expect-error below because
          // with @ts-expect-error I get a red underline in vscode, but
          // without it I get errors from `yarn lint`.
          // @ts-ignore inadequate type inference
          // See https://github.com/endojs/endo/pull/1259#discussion_r954561901
          const { original, rest } = encoding;
          assert(
            hasOwnPropertyOf(encoding, 'original'),
            X`Invalid Hilbert Hotel encoding ${encoding}`,
          );
          // Don't harden since we're not done mutating it
          const result = { [SCLASS]: decodeFromSmallcaps(original) };
          if (hasOwnPropertyOf(encoding, 'rest')) {
            assert(
              typeof rest === 'object' &&
                rest !== null &&
                ownKeys(rest).length >= 1,
              X`Rest encoding must be a non-empty object: ${rest}`,
            );
            const restObj = decodeFromSmallcaps(rest);
            // TODO really should assert that `passStyleOf(rest)` is
            // `'copyRecord'` but we'd have to harden it and it is too
            // early to do that.
            assert(
              !hasSClass(restObj),
              X`Rest must not contain its own definition of ${q(SCLASS)}`,
            );
            defineProperties(result, getOwnPropertyDescriptors(restObj));
          }
          return result;
        }

        case 'ibid':
        case 'undefined':
        case 'NaN':
        case 'Infinity':
        case '-Infinity':
        case '@@asyncIterator':
        case 'symbol':
        case 'slot': {
          assert.fail(
            X`Unlike capData, the smallcaps protocol does not support [${q(
              sclass,
            )} encoding: ${encoding}.`,
          );
        }
        default: {
          assert.fail(X`unrecognized ${q(SCLASS)}: ${q(sclass)}`, TypeError);
        }
      }
    } else {
      assert(typeof encoding === 'object' && encoding !== null);
      const result = {};
      for (const name of ownKeys(encoding)) {
        if (typeof name !== 'string') {
          assert.fail(
            X`Property name ${q(name)} of ${encoding} must be a string`,
          );
        }
        result[name] = decodeFromSmallcaps(encoding[name]);
      }
      return result;
    }
  };
  return harden(decodeFromSmallcaps);
};
