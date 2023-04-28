// @ts-nocheck So many errors that the suppressions hamper readability.
// TODO fix and then turn at-ts-check back on
import {
  assertChecker,
  makeTagged,
  passStyleOf,
  recordNames,
  recordValues,
} from '@endo/marshal';
import {
  kindOf,
  assertPattern,
  maybeMatchHelper,
  matches,
  checkMatches,
  mustMatch,
} from './patternMatchers.js';
import { isKey } from '../keys/checkKey.js';
import { keyEQ } from '../keys/compareKeys.js';

/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('../types.js').Compress} Compress */
/** @typedef {import('../types.js').MustCompress} MustCompress */
/** @typedef {import('../types.js').Decompress} Decompress */
/** @typedef {import('../types.js').MustDecompress} MustDecompress */
/** @typedef {import('../types.js').Pattern} Pattern */

const { fromEntries } = Object;
const { Fail, quote: q } = assert;

const isNonCompressingMatcher = pattern => {
  const patternKind = kindOf(pattern);
  if (patternKind === undefined) {
    return false;
  }
  const matchHelper = maybeMatchHelper(patternKind);
  return matchHelper && matchHelper.compress === undefined;
};

/**
 * When, for example, all the specimens in a given store match a
 * specific pattern, then each of those specimens must contain the same
 * literal superstructure as their one shared pattern. Therefore, storing
 * that literal superstructure would be redumdant. If `specimen` does
 * match `pattern`, then `compress(specimen, pattern)` will return a bindings
 * array which is hopefully more compact than `specimen` as a whole, but
 * carries all the information from specimen that cannot be derived just
 * from knowledge that it matches this `pattern`.
 *
 * @type {Compress}
 */
const compress = (specimen, pattern) => {
  if (isNonCompressingMatcher(pattern)) {
    if (matches(specimen, pattern)) {
      return harden({ compressed: specimen });
    }
    return undefined;
  }

  // Not yet frozen! Used to accumulate bindings
  const bindings = [];
  const emitBinding = binding => {
    bindings.push(binding);
  };
  harden(emitBinding);

  /**
   * @param {Passable} innerSpecimen
   * @param {Pattern} innerPattern
   * @returns {boolean}
   */
  const compressRecur = (innerSpecimen, innerPattern) => {
    assertPattern(innerPattern);
    if (isKey(innerPattern)) {
      return keyEQ(innerSpecimen, innerPattern);
    }
    const patternKind = kindOf(innerPattern);
    const specimenKind = kindOf(innerSpecimen);
    switch (patternKind) {
      case undefined: {
        return false;
      }
      case 'copyArray': {
        if (
          specimenKind !== 'copyArray' ||
          innerSpecimen.length !== innerPattern.length
        ) {
          return false;
        }
        return innerPattern.every((p, i) => compressRecur(innerSpecimen[i], p));
      }
      case 'copyRecord': {
        if (specimenKind !== 'copyRecord') {
          return false;
        }
        const specimenNames = recordNames(innerSpecimen);
        const pattNames = recordNames(innerPattern);

        if (specimenNames.length !== pattNames.length) {
          return false;
        }
        const specimenValues = recordValues(innerSpecimen, specimenNames);
        const pattValues = recordValues(innerPattern, pattNames);

        return pattNames.every(
          (name, i) =>
            specimenNames[i] === name &&
            compressRecur(specimenValues[i], pattValues[i]),
        );
      }
      case 'copyMap': {
        if (specimenKind !== 'copyMap') {
          return false;
        }
        const {
          payload: { keys: pattKeys, values: valuePatts },
        } = innerPattern;
        const {
          payload: { keys: specimenKeys, values: specimenValues },
        } = innerSpecimen;
        // TODO BUG: this assumes that the keys appear in the
        // same order, so we can compare values in that order.
        // However, we're only guaranteed that they appear in
        // the same rankOrder. Thus we must search one of these
        // in the other's rankOrder.
        if (!keyEQ(specimenKeys, pattKeys)) {
          return false;
        }
        return compressRecur(specimenValues, valuePatts);
      }
      default:
        {
          const matchHelper = maybeMatchHelper(patternKind);
          if (matchHelper) {
            if (matchHelper.compress) {
              const subCompressedRecord = matchHelper.compress(
                innerSpecimen,
                innerPattern.payload,
                compress,
              );
              if (subCompressedRecord === undefined) {
                return false;
              } else {
                emitBinding(subCompressedRecord.compressed);
                return true;
              }
            } else if (matches(innerSpecimen, innerPattern)) {
              assert(isNonCompressingMatcher(innerPattern));
              emitBinding(innerSpecimen);
              return true;
            } else {
              return false;
            }
          }
        }
        throw Fail`unrecognized kind: ${q(patternKind)}`;
    }
  };

  if (compressRecur(specimen, pattern)) {
    return harden({ compressed: bindings });
  } else {
    return undefined;
  }
};
harden(compress);

/**
 * `mustCompress` is to `compress` approximately as `fit` is to `matches`.
 * Where `compress` indicates pattern match failure by returning `undefined`,
 * `mustCompress` indicates pattern match failure by throwing an error
 * with a good pattern-match-failure diagnostic. Thus, like `fit`,
 * `mustCompress` has an additional optional `label` parameter to be used on
 * the outside of that diagnostic if needed. If `mustCompress` does return
 * normally, then the pattern match succeeded and `mustCompress` returns a
 * valid compressed value.
 *
 * @type {MustCompress}
 */
export const mustCompress = (specimen, pattern, label = undefined) => {
  const compressedRecord = compress(specimen, pattern);
  if (compressedRecord !== undefined) {
    return compressedRecord.compressed;
  }
  // `compress` is validating, so we don't need to redo all of `mustMatch`.
  // We use it only to generate the error.
  // Should only throw
  checkMatches(specimen, pattern, assertChecker, label);
  throw Fail`internal: ${label}: inconsistent pattern match: ${q(pattern)}`;
};
harden(mustCompress);

/**
 * `decompress` reverses the compression performed by `compress`
 * or `mustCompress`, in order to recover the equivalent
 * of the original specimen from the `bindings` array and the `pattern`.
 *
 * @type {Decompress}
 */
const decompress = (compressed, pattern) => {
  if (isNonCompressingMatcher(pattern)) {
    return compressed;
  }

  assert(Array.isArray(compressed));
  passStyleOf(compressed) === 'copyArray' ||
    Fail`Pattern ${pattern} expected bindings array: ${compressed}`;
  let i = 0;
  const takeBinding = () => {
    i < compressed.length ||
      Fail`Pattern  ${q(pattern)} expects more than ${q(
        compressed.length,
      )} bindings: ${compressed}`;
    const binding = compressed[i];
    i += 1;
    return binding;
  };
  harden(takeBinding);

  const decompressRecur = innerPattern => {
    assertPattern(innerPattern);
    if (isKey(innerPattern)) {
      return innerPattern;
    }
    const patternKind = kindOf(innerPattern);
    switch (patternKind) {
      case undefined: {
        throw Fail`decompress expected a pattern: ${q(innerPattern)}`;
      }
      case 'copyArray': {
        return harden(innerPattern.map(p => decompressRecur(p)));
      }
      case 'copyRecord': {
        const pattNames = recordNames(innerPattern);
        const pattValues = recordValues(innerPattern, pattNames);
        const entries = pattNames.map((name, j) => [
          name,
          decompressRecur(pattValues[j]),
        ]);
        // Reverse so printed form looks less surprising,
        // with ascenting rather than descending property names.
        return harden(fromEntries(entries.reverse()));
      }
      case 'copyMap': {
        const {
          payload: { keys: pattKeys, values: valuePatts },
        } = innerPattern;
        return makeTagged(
          'copyMap',
          harden({
            keys: pattKeys,
            values: valuePatts.map(p => decompressRecur(p)),
          }),
        );
      }
      default:
        {
          const matchHelper = maybeMatchHelper(patternKind);
          if (matchHelper) {
            if (matchHelper.decompress) {
              const subCompressed = takeBinding();
              return matchHelper.decompress(
                subCompressed,
                innerPattern.payload,
                decompress,
              );
            } else {
              assert(isNonCompressingMatcher(innerPattern));
              return takeBinding();
            }
          }
        }
        throw Fail`unrecognized pattern kind: ${q(patternKind)} ${q(
          innerPattern,
        )}`;
    }
  };

  return decompressRecur(pattern);
};
harden(decompress);

/**
 * `decompress` reverses the compression performed by `compress`
 * or `mustCompress`, in order to recover the equivalent
 * of the original specimen from `compressed` and `pattern`.
 *
 * @type {MustDecompress}
 */
export const mustDecompress = (compressed, pattern, label = undefined) => {
  const value = decompress(compressed, pattern);
  // `decompress` does some checking, but is not validating, so we
  // need to do the full `mustMatch` here to validate as well as to generate
  // the error if invalid.
  mustMatch(value, pattern, label);
  return value;
};
