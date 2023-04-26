// @ts-check
import { assertChecker, makeTagged, passStyleOf } from '@endo/marshal';
import { recordNames, recordValues } from '@endo/marshal/src/encodePassable.js';

import {
  kindOf,
  assertPattern,
  maybeMatchHelper,
  matches,
  checkMatches,
} from './patternMatchers.js';
import { isKey } from '../keys/checkKey.js';
import { keyEQ } from '../keys/compareKeys.js';

/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('./patternMatchers.js').Compress} Compress */
/** @typedef {import('./patternMatchers.js').MustCompress} MustCompress */
/** @typedef {import('./patternMatchers.js').Decompress} Decompress */
/** @typedef {import('../types.js').Pattern} Pattern */

const { fromEntries } = Object;
const { details: X, quote: q } = assert;

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
export const compress = (specimen, pattern) => {
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
              const subBindings = matchHelper.compress(
                innerSpecimen,
                innerPattern.payload,
                compress,
              );
              if (subBindings === undefined) {
                return false;
              } else {
                // Note that we're not flattening the subBindings
                // Note that as long as we allow this kind of nested compression,
                // we cannot feasibly preserve sort order anyway.
                emitBinding(subBindings);
                return true;
              }
            } else if (matches(innerSpecimen, innerPattern)) {
              emitBinding(innerSpecimen);
              return true;
            } else {
              return false;
            }
          }
        }
        assert.fail(X`unrecognized kind: ${q(patternKind)}`);
    }
  };

  if (compressRecur(specimen, pattern)) {
    return harden(bindings);
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
 * valid bindings array.
 *
 * @type {MustCompress}
 */
export const mustCompress = (specimen, pattern, label = undefined) => {
  const bindings = compress(specimen, pattern);
  if (bindings !== undefined) {
    return bindings;
  }
  // should only throw
  checkMatches(specimen, pattern, assertChecker, label);
  assert.fail(X`internal: ${label}: inconsistent pattern match: ${q(pattern)}`);
};
harden(mustCompress);

/**
 * `decompress` reverses the compression performed by `compress`
 * or `mustCompress`, in order to recover the equivalent
 * of the original specimen from the `bindings` array and the `pattern`.
 *
 * @type {Decompress}
 */
export const decompress = (bindings, pattern) => {
  passStyleOf(bindings) === 'copyArray' ||
    assert.fail(X`Pattern ${pattern} expected bindings array: ${bindings}`);
  let i = 0;
  const takeBinding = () => {
    i < bindings.length ||
      assert.fail(
        X`Pattern  ${q(pattern)} expects more than ${q(
          bindings.length,
        )} bindings: ${bindings}`,
      );
    const binding = bindings[i];
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
        assert.fail(X`decompress expected a pattern: ${q(innerPattern)}`);
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
              const subBindings = takeBinding();
              passStyleOf(subBindings) === 'copyArray' ||
                assert.fail(
                  X`Pattern ${q(
                    innerPattern,
                  )} expected nested bindings array: ${subBindings}`,
                );

              return matchHelper.decompress(
                subBindings,
                innerPattern.payload,
                decompress,
              );
            } else {
              return takeBinding();
            }
          }
        }
        assert.fail(
          X`unrecognized pattern kind: ${q(patternKind)} ${q(innerPattern)}`,
        );
    }
  };

  return decompressRecur(pattern);
};
harden(decompress);
