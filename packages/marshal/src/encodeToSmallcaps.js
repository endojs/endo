// @ts-check
/// <reference types="ses"/>

// This module is based on the `encodePassable.js` in `@agoric/store`,
// which may migrate here. The main external difference is that
// `encodePassable` goes directly to string, whereas `encodeToSmallcaps`
// encodes to Smallcaps, a JSON-representable data structure, and leaves it to
// the caller (`marshal.js`) to stringify it.

import {
  passStyleOf,
  isErrorLike,
  makeTagged,
  getTag,
  hasOwnPropertyOf,
  assertPassableSymbol,
  nameForPassableSymbol,
  passableSymbolForName,
} from '@endo/pass-style';
import { X, Fail, q } from '@endo/errors';

/** @import {Passable, Remotable} from '@endo/pass-style' */
// FIXME define actual types
/** @typedef {any} SmallcapsEncoding */
/** @typedef {any} SmallcapsEncodingUnion */

const { ownKeys } = Reflect;
const { isArray } = Array;
const { is, entries, fromEntries } = Object;

const BANG = '!'.charCodeAt(0);
const DASH = '-'.charCodeAt(0);

/**
 * An `encodeToSmallcaps` function takes a passable and returns a
 * JSON-representable object (i.e., round-tripping it through
 * `JSON.stringify` and `JSON.parse` with no replacers or revivers
 * returns an equivalent structure except for object identity).
 * We call this representation a Smallcaps Encoding.
 *
 * A `decodeFromSmallcaps` function takes as argument what it
 * *assumes* is the result of a plain `JSON.parse` with no resolver. It then
 * must validate that it is a valid Smallcaps Encoding, and if it is,
 * return a corresponding passable.
 *
 * Smallcaps considers the characters between `!` (ascii code 33, BANG)
 * and `-` (ascii code 45, DASH) to be special prefixes allowing
 * representation of JSON-incompatible data using strings.
 * These characters, in order, are `!"#$%&'()*+,-`
 * Of these, smallcaps currently uses the following:
 *
 *  * `!` - escaped string
 *  * `+` - non-negative bigint
 *  * `-` - negative bigint
 *  * `#` - manifest constant
 *  * `%` - symbol
 *  * `$` - remotable
 *  * `&` - promise
 *
 * All other special characters (`"'()*,`) are reserved for future use.
 *
 * The manifest constants that smallcaps currently uses for values:
 *  * `#undefined`
 *  * `#NaN`
 *  * `#Infinity`
 *  * `#-Infinity`
 *
 * and for property names analogous to capdata @qclass:
 *  * `#tag`
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
  // charCodeAt(0) and number compare is a bit faster.
  const code = encodedStr.charCodeAt(0);
  // eslint-disable-next-line yoda
  return BANG <= code && code <= DASH;
};

/**
 * @typedef {object} EncodeToSmallcapsOptions
 * @property {(
 *   remotable: Remotable,
 *   encodeRecur: (p: Passable) => SmallcapsEncoding
 * ) => SmallcapsEncoding} [encodeRemotableToSmallcaps]
 * @property {(
 *   promise: Promise,
 *   encodeRecur: (p: Passable) => SmallcapsEncoding
 * ) => SmallcapsEncoding} [encodePromiseToSmallcaps]
 * @property {(
 *   error: Error,
 *   encodeRecur: (p: Passable) => SmallcapsEncoding
 * ) => SmallcapsEncoding} [encodeErrorToSmallcaps]
 */

const dontEncodeRemotableToSmallcaps = rem =>
  Fail`remotable unexpected: ${rem}`;

const dontEncodePromiseToSmallcaps = prom => Fail`promise unexpected: ${prom}`;

const dontEncodeErrorToSmallcaps = err =>
  Fail`error object unexpected: ${q(err)}`;

/**
 * @param {EncodeToSmallcapsOptions} [encodeOptions]
 * encodeOptions is actually optional, but not marked as such to work around
 * https://github.com/microsoft/TypeScript/issues/50286
 *
 * @returns {(passable: Passable) => SmallcapsEncoding}
 */
export const makeEncodeToSmallcaps = (encodeOptions = {}) => {
  const {
    encodeRemotableToSmallcaps = dontEncodeRemotableToSmallcaps,
    encodePromiseToSmallcaps = dontEncodePromiseToSmallcaps,
    encodeErrorToSmallcaps = dontEncodeErrorToSmallcaps,
  } = encodeOptions;

  const assertEncodedError = encoding => {
    (typeof encoding === 'object' && hasOwnPropertyOf(encoding, '#error')) ||
      Fail`internal: Error encoding must have "#error" property: ${q(
        encoding,
      )}`;
    // Assert that the #error property decodes to a string.
    const message = encoding['#error'];
    (typeof message === 'string' &&
      (!startsSpecial(message) || message.charAt(0) === '!')) ||
      Fail`internal: Error encoding must have string message: ${q(message)}`;
  };

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
   * @param {any} passable
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
        if (startsSpecial(passable)) {
          // Strings that start with a special char are quoted with `!`.
          // Since `!` is itself a special character, this trivially does
          // the Hilbert hotel. Also, since the special characters are
          // a continuous subrange of ascii, this quoting is sort-order
          // preserving.
          return `!${passable}`;
        }
        // All other strings pass through to JSON
        return passable;
      }
      case 'undefined': {
        return '#undefined';
      }
      case 'number': {
        // Special-case numbers with no digit-based representation.
        if (Number.isNaN(passable)) {
          return '#NaN';
        } else if (passable === Infinity) {
          return '#Infinity';
        } else if (passable === -Infinity) {
          return '#-Infinity';
        }
        // Pass through everything else, replacing -0 with 0.
        return is(passable, -0) ? 0 : passable;
      }
      case 'bigint': {
        const str = String(passable);
        return /** @type {bigint} */ (passable) < 0n ? str : `+${str}`;
      }
      case 'symbol': {
        assertPassableSymbol(passable);
        const name = /** @type {string} */ (nameForPassableSymbol(passable));
        return `%${name}`;
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
          '#tag': encodeToSmallcapsRecur(getTag(passable)),
          payload: encodeToSmallcapsRecur(passable.payload),
        };
      }
      case 'remotable': {
        const result = encodeRemotableToSmallcaps(
          passable,
          encodeToSmallcapsRecur,
        );
        if (typeof result === 'string' && result.charAt(0) === '$') {
          return result;
        }
        // `throw` is noop since `Fail` throws. But linter confused
        throw Fail`internal: Remotable encoding must start with "$": ${result}`;
      }
      case 'promise': {
        const result = encodePromiseToSmallcaps(
          passable,
          encodeToSmallcapsRecur,
        );
        if (typeof result === 'string' && result.charAt(0) === '&') {
          return result;
        }
        throw Fail`internal: Promise encoding must start with "&": ${result}`;
      }
      case 'error': {
        const result = encodeErrorToSmallcaps(passable, encodeToSmallcapsRecur);
        assertEncodedError(result);
        return result;
      }
      default: {
        throw assert.fail(
          X`internal: Unrecognized passStyle ${q(passStyle)}`,
          TypeError,
        );
      }
    }
  };
  const encodeToSmallcaps = passable => {
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
      const result = harden(
        encodeErrorToSmallcaps(passable, encodeToSmallcapsRecur),
      );
      assertEncodedError(result);
      return result;
    }
    return harden(encodeToSmallcapsRecur(passable));
  };
  return harden(encodeToSmallcaps);
};
harden(makeEncodeToSmallcaps);

/**
 * @typedef {object} DecodeFromSmallcapsOptions
 * @property {(
 *   encodedRemotable: SmallcapsEncoding,
 *   decodeRecur: (e :SmallcapsEncoding) => Passable
 * ) => Remotable} [decodeRemotableFromSmallcaps]
 * @property {(
 *   encodedPromise: SmallcapsEncoding,
 *   decodeRecur: (e :SmallcapsEncoding) => Passable
 * ) => Promise} [decodePromiseFromSmallcaps]
 * @property {(
 *   encodedError: SmallcapsEncoding,
 *   decodeRecur: (e :SmallcapsEncoding) => Passable
 * ) => Error} [decodeErrorFromSmallcaps]
 */

const dontDecodeRemotableFromSmallcaps = encoding =>
  Fail`remotable unexpected: ${encoding}`;
const dontDecodePromiseFromSmallcaps = encoding =>
  Fail`promise unexpected: ${encoding}`;
const dontDecodeErrorFromSmallcaps = encoding =>
  Fail`error unexpected: ${q(encoding)}`;

/**
 * @param {DecodeFromSmallcapsOptions} [decodeOptions]
 * @returns {(encoded: SmallcapsEncoding) => Passable}
 */
export const makeDecodeFromSmallcaps = (decodeOptions = {}) => {
  const {
    decodeRemotableFromSmallcaps = dontDecodeRemotableFromSmallcaps,
    decodePromiseFromSmallcaps = dontDecodePromiseFromSmallcaps,
    decodeErrorFromSmallcaps = dontDecodeErrorFromSmallcaps,
  } = decodeOptions;

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
        if (!startsSpecial(encoding)) {
          return encoding;
        }
        const c = encoding.charAt(0);
        switch (c) {
          case '!': {
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
                throw assert.fail(
                  X`unknown constant "${q(encoding)}"`,
                  TypeError,
                );
              }
            }
          }
          case '+':
          case '-': {
            return BigInt(encoding);
          }
          case '$': {
            const result = decodeRemotableFromSmallcaps(
              encoding,
              decodeFromSmallcaps,
            );
            // // @ts-ignore XXX SmallCapsEncoding
            // if (passStyleOf(result) !== 'remotable') {
            //   Fail`internal: decodeRemotableFromSmallcaps option must return a remotable: ${result}`;
            // }
            return result;
          }
          case '&': {
            const result = decodePromiseFromSmallcaps(
              encoding,
              decodeFromSmallcaps,
            );
            if (passStyleOf(result) !== 'promise') {
              Fail`internal: decodePromiseFromSmallcaps option must return a promise: ${result}`;
            }
            return result;
          }
          default: {
            throw Fail`Special char ${q(
              c,
            )} reserved for future use: ${encoding}`;
          }
        }
      }
      case 'object': {
        if (encoding === null) {
          return encoding;
        }

        if (isArray(encoding)) {
          return encoding.map(val => decodeFromSmallcaps(val));
        }

        if (hasOwnPropertyOf(encoding, '#tag')) {
          const { '#tag': tag, payload, ...rest } = encoding;
          typeof tag === 'string' ||
            Fail`Value of "#tag", the tag, must be a string: ${encoding}`;
          ownKeys(rest).length === 0 ||
            Fail`#tag record unexpected properties: ${q(ownKeys(rest))}`;
          return makeTagged(
            decodeFromSmallcaps(tag),
            decodeFromSmallcaps(payload),
          );
        }

        if (hasOwnPropertyOf(encoding, '#error')) {
          const result = decodeErrorFromSmallcaps(
            encoding,
            decodeFromSmallcaps,
          );
          passStyleOf(result) === 'error' ||
            Fail`internal: decodeErrorFromSmallcaps option must return an error: ${result}`;
          return result;
        }

        const decodeEntry = ([encodedName, encodedVal]) => {
          typeof encodedName === 'string' ||
            Fail`Property name ${q(
              encodedName,
            )} of ${encoding} must be a string`;
          encodedName.charAt(0) !== '#' ||
            Fail`Unrecognized record type ${q(encodedName)}: ${encoding}`;
          const name = decodeFromSmallcaps(encodedName);
          typeof name === 'string' ||
            Fail`Decoded property name ${name} from ${encoding} must be a string`;
          return [name, decodeFromSmallcaps(encodedVal)];
        };
        const decodedEntries = entries(encoding).map(decodeEntry);
        return fromEntries(decodedEntries);
      }
      default: {
        throw assert.fail(
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
