/// <reference types="ses"/>

import {
  assertPassableSymbol,
  Far,
  getErrorConstructor,
  hasOwnPropertyOf,
  mapIterable,
  nameForPassableSymbol,
  passableSymbolForName,
} from '@endo/pass-style';
import {
  startsSpecial,
  encodeStringToSmallcaps as buildString,
} from '../encodeToSmallcaps.js';

/** @typedef {import('../encodeToSmallcaps.js').SmallcapsEncoding} SmallcapsEncoding */

const { is, fromEntries } = Object;
const { isArray } = Array;
const { ownKeys } = Reflect;
const { quote: q, details: X, Fail } = assert;

const makeSmallcapsBuilder = () => {
  /** @type {Builder<SmallcapsEncoding,SmallcapsEncoding>} */
  const smallcapsBuilder = Far('SmallcapsBuilder', {
    buildRoot: buildTopFn => buildTopFn(),

    buildUndefined: () => '#undefined',
    buildNull: () => null,
    buildBoolean: flag => flag,
    buildNumber: num => {
      // Special-case numbers with no digit-based representation.
      if (Number.isNaN(num)) {
        return '#NaN';
      } else if (num === Infinity) {
        return '#Infinity';
      } else if (num === -Infinity) {
        return '#-Infinity';
      }
      // Pass through everything else, replacing -0 with 0.
      return is(num, -0) ? 0 : num;
    },
    buildBigint: bigint => {
      const str = String(bigint);
      return bigint < 0n ? str : `+${str}`;
    },
    buildString,
    buildSymbol: sym => {
      assertPassableSymbol(sym);
      const name = /** @type {string} */ (nameForPassableSymbol(sym));
      return `%${name}`;
    },
    buildRecord: (names, buildValuesIter) => {
      const builtValues = [...buildValuesIter];
      assert(names.length === builtValues.length);
      // TODO Should be fromUniqueEntries, but utils needs to be
      // relocated first.
      return fromEntries(names.map((name, i) => [name, builtValues[i]]));
    },
    buildArray: (_count, buildElementsIter) => harden([...buildElementsIter]),
    buildTagged: (tagName, buildPayloadFn) => ({
      '#tag': buildString(tagName),
      payload: buildPayloadFn(),
    }),

    // TODO slots and options and all that. Also errorId
    buildError: error => ({
      '#error': buildString(error.message),
      name: buildString(error.name),
    }),
    // TODO slots and options and all that.
    buildRemotable: _remotable => '$',
    // TODO slots and options and all that.
    buildPromise: _promise => '&',
  });
  return smallcapsBuilder;
};
harden(makeSmallcapsBuilder);

/**
 * Must be consistent with the full string recognition algorithm.
 * Must return what that algorithm would pass to builder.buildString.
 *
 * @param {string} str
 */
const recognizeString = str => {
  typeof str === 'string' || Fail`${str} must be a string`;
  if (!startsSpecial(str)) {
    return str;
  }
  const c = str.charAt(0);
  c === '!' || Fail`${str} must encode a string`;
  return str.slice(1);
};

const makeSmallcapsRecognizer = () => {
  /**
   * @param {SmallcapsEncoding} encoding
   * @param {Builder<SmallcapsEncoding, SmallcapsEncoding>} builder
   * @returns {SmallcapsEncoding}
   */
  const recognizeNode = (encoding, builder) => {
    switch (typeof encoding) {
      case 'boolean': {
        return builder.buildBoolean(encoding);
      }
      case 'number': {
        return builder.buildNumber(encoding);
      }
      case 'string': {
        if (!startsSpecial(encoding)) {
          return builder.buildString(encoding);
        }
        const c = encoding.charAt(0);
        switch (c) {
          case '!': {
            // un-hilbert-ify the string
            return builder.buildString(encoding.slice(1));
          }
          case '%': {
            const sym = passableSymbolForName(encoding.slice(1));
            assert(sym !== undefined);
            return builder.buildSymbol(sym);
          }
          case '#': {
            switch (encoding) {
              case '#undefined': {
                return builder.buildUndefined();
              }
              case '#NaN': {
                return builder.buildNumber(NaN);
              }
              case '#Infinity': {
                return builder.buildNumber(Infinity);
              }
              case '#-Infinity': {
                return builder.buildNumber(-Infinity);
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
            return builder.buildBigint(BigInt(encoding));
          }
          case '$': {
            // TODO slots and options and all that.
            return builder.buildRemotable(Far('dummy'));
          }
          case '&': {
            // TODO slots and options and all that.
            return builder.buildPromise(Promise.resolve('dummy'));
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
          return builder.buildNull();
        }

        if (isArray(encoding)) {
          const buildElementsIter = mapIterable(encoding, val =>
            recognizeNode(val, builder),
          );
          return builder.buildArray(encoding.length, buildElementsIter);
        }

        if (hasOwnPropertyOf(encoding, '#tag')) {
          const { '#tag': tag, payload, ...rest } = encoding;
          ownKeys(rest).length === 0 ||
            Fail`#tag record unexpected properties: ${q(ownKeys(rest))}`;
          const buildPayloadFn = () => recognizeNode(payload, builder);
          return builder.buildTagged(recognizeString(tag), buildPayloadFn);
        }

        if (hasOwnPropertyOf(encoding, '#error')) {
          // TODO slots and options and all that. Also errorId
          const { '#error': message, name } = encoding;
          const dMessage = recognizeString(message);
          const dName = recognizeString(name);
          const EC = getErrorConstructor(dName) || Error;
          const errorName = `Remote${EC.name}`;
          const error = assert.error(dMessage, EC, { errorName });
          return builder.buildError(error);
        }

        const encodedNames = /** @type {string[]} */ (ownKeys(encoding)).sort();
        for (const encodedName of encodedNames) {
          typeof encodedName === 'string' ||
            Fail`Property name ${q(
              encodedName,
            )} of ${encoding} must be a string`;
          !encodedName.startsWith('#') ||
            Fail`Unrecognized record type ${q(encodedName)}: ${encoding}`;
        }
        const buildValuesIter = mapIterable(encodedNames, encodedName =>
          recognizeNode(encoding[encodedName], builder),
        );
        return builder.buildRecord(
          encodedNames.map(recognizeString),
          buildValuesIter,
        );
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
  /**
   * @param {SmallcapsEncoding} encoding
   * @param {Builder<SmallcapsEncoding, SmallcapsEncoding>} builder
   * @returns {SmallcapsEncoding}
   */
  const recognizeSmallcaps = (encoding, builder) =>
    builder.buildRoot(() => recognizeNode(encoding, builder));
  return harden(recognizeSmallcaps);
};
harden(makeSmallcapsRecognizer);

export {
  makeSmallcapsBuilder as makeBuilder,
  makeSmallcapsRecognizer as makeRecognizer,
};
