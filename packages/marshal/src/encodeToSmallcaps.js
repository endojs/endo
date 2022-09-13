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
import { getTag, hasOwnPropertyOf } from './helpers/passStyle-helpers.js';
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
const { is, fromEntries } = Object;
const { details: X, quote: q } = assert;

/**
 * Smallcaps considers the characters between `!` (ascii code 33)
 * and `-` (ascii code 45) to be special. These characters, in order, are
 * `!"#$%&'()*+,-` Of these, smallcaps currently uses the following:
 *
 *  * `'` - escaped string
 *  * `+` - non-negative bigint
 *  * `-` - negative bigint
 *  * `#` - manifest constant
 *  * `%` - symbol
 *  * `$` - remotable
 *  * `&` - promise
 *
 * All other special characters (`!"()*,`) are reserved for future use.
 *
 * The menifest constants that smallcaps currently uses for values:
 *  * `#undefined`
 *  * `#NaN`
 *  * `#Infinity`
 *  * `#-Infinity`
 *
 * and for property names:
 *  * `#tagged`
 *  * `#error`
 *
 * All other encoded strings beginning with `#` are reserved for
 * future use.
 *
 * @param {string} encodedStr
 * @returns {boolean}
 */
const startsSpecial = encodedStr => {
  if (encodedStr === '') {
    return false;
  }
  const c = encodedStr[0];
  // eslint-disable-next-line yoda
  return '!' <= c && c <= '-';
};

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
        // pass through to JSON
        return passable;
      }
      case 'string': {
        if (startsSpecial(passable[0])) {
          // Strings that start with a special char are quoted with `'`.
          // Since `'` is itself a special character, this trivially does
          // the Hilbert hotel. Also, since the special characters are
          // a continuous subrange of ascii, this quoting is sort-order
          // preserving.
          return `'${passable}`;
        }
        // All other strings pass through to JSON
        return passable;
      }
      case 'symbol': {
        // At the smallcaps level, we prefix symbol names with `%`.
        // By "symbol name", we mean according to `nameForPassableSymbol`
        // which does some further escaping. See comment on that function.
        assertPassableSymbol(passable);
        const name = /** @type {string} */ (nameForPassableSymbol(passable));
        return `%${name}`;
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
        // All other numbers pass through to JSON
        return passable;
      }
      case 'bigint': {
        const str = String(passable);
        return passable < 0n ? `${str}n` : `+${str}n`;
      }
      case 'copyRecord': {
        // Currently copyRecord allows only string keys so this will
        // work. If we allow sortable symbol keys, this will need to
        // become more interesting.
        const names = ownKeys(passable).sort();
        return fromEntries(
          names.map(name => [
            encodeToSmallcapsRecur(name),
            encodeToSmallcapsRecur(passable[name]),
          ]),
        );
      }
      case 'copyArray': {
        return passable.map(encodeToSmallcapsRecur);
      }
      case 'tagged': {
        return {
          '#tagged': getTag(passable),
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
        if (typeof result === 'string' && result.startsWith('&')) {
          return result;
        }
        assert.fail(
          X`internal: Promise encoding must start with "&": ${result}`,
        );
      }
      case 'error': {
        const result = encodeErrorToSmallcaps(passable);
        if (
          typeof result === 'object' &&
          typeof result['#error'] === 'string'
        ) {
          return result;
        }
        assert.fail(
          X`internal: Error encoding must have "#error" property: ${result}`,
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
    switch (typeof encoding) {
      case 'boolean':
      case 'number': {
        return encoding;
      }
      case 'string': {
        if (encoding === '') {
          return encoding;
        }
        switch (encoding[0]) {
          case "'": {
            // un-hilbert-ify the string
            return encoding.slice(1);
          }
          case '%': {
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
          case '&': {
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
      case 'object': {
        if (encoding === null) {
          return encoding;
        }

        if (isArray(encoding)) {
          const result = [];
          const { length } = encoding;
          for (let i = 0; i < length; i += 1) {
            result[i] = decodeFromSmallcaps(encoding[i]);
          }
          return result;
        }

        if (hasOwnPropertyOf(encoding, '#tagged')) {
          const { '#tagged': tag, payload, ...rest } = encoding;
          typeof tag === 'string' ||
            assert.fail(
              X`Value of "#tagged", the tag, must be a string: ${encoding}`,
            );
          ownKeys(rest).length === 0 ||
            assert.fail(
              X`#tagged record unexpected properties: ${q(ownKeys(rest))}`,
            );
          return makeTagged(tag, decodeFromSmallcaps(payload));
        }

        if (hasOwnPropertyOf(encoding, '#error')) {
          const result = decodeErrorFromSmallcaps(encoding);
          passStyleOf(result) === 'error' ||
            assert.fail(
              X`internal: decodeErrorFromSmallcaps option must return an error: ${result}`,
            );
          return result;
        }

        const result = {};
        for (const encodedName of ownKeys(encoding)) {
          if (typeof encodedName !== 'string') {
            // TypeScript confused about `||` control flow so use `if` instead
            // https://github.com/microsoft/TypeScript/issues/50739
            assert.fail(
              X`Property name ${q(
                encodedName,
              )} of ${encoding} must be a string`,
            );
          }
          !encodedName.startsWith('#') ||
            assert.fail(
              X`Unrecognized record type ${q(encodedName)}: ${encoding}`,
            );
          const name = decodeFromSmallcaps(encodedName);
          result[name] = decodeFromSmallcaps(encoding[encodedName]);
        }
        return result;
      }
      default: {
        assert.fail(
          X`internal: unrecognized JSON typeof ${q(
            typeof encoding,
          )}: ${encoding}`,
          TypeError,
        );
      }
    }
  };
  return harden(decodeFromSmallcaps);
};
