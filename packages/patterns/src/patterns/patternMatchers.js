import {
  assertChecker,
  Far,
  getTag,
  makeTagged,
  passStyleOf,
  hasOwnPropertyOf,
  nameForPassableSymbol,
  compareRank,
  getPassStyleCover,
  intersectRankCovers,
  unionRankCovers,
  recordNames,
  recordValues,
} from '@endo/marshal';
import {
  identChecker,
  applyLabelingError,
  fromUniqueEntries,
  listDifference,
} from '../utils.js';

import { keyEQ, keyGT, keyGTE, keyLT, keyLTE } from '../keys/compareKeys.js';
import {
  assertKey,
  checkKey,
  isKey,
  checkScalarKey,
  checkCopySet,
  checkCopyMap,
  copyMapKeySet,
  checkCopyBag,
  makeCopyMap,
} from '../keys/checkKey.js';

import './internal-types.js';

/// <reference types="ses"/>

const { quote: q, bare: b, details: X, Fail } = assert;
const { entries, values } = Object;
const { ownKeys } = Reflect;

/** @type {WeakSet<Pattern>} */
const patternMemo = new WeakSet();

// /////////////////////// Match Helpers Helpers /////////////////////////////

/** For forward references to `M` */
let MM;

/**
 * The actual default values here are, at the present time, fairly
 * arbitrary choices and may change before they settle down. Of course
 * at some point we'll need to stop changing them. But we should first
 * see how our system holds up with these choices. The main criteria
 * is that they be big enough that "normal" innocent programs rarely
 * encounter these limits.
 *
 * Exported primarily for testing.
 */
export const defaultLimits = harden({
  decimalDigitsLimit: 100,
  stringLengthLimit: 100_000,
  symbolNameLengthLimit: 100,
  numPropertiesLimit: 80,
  propertyNameLengthLimit: 100,
  arrayLengthLimit: 10_000,
  numSetElementsLimit: 10_000,
  numUniqueBagElementsLimit: 10_000,
  numMapEntriesLimit: 5000,
});

/**
 * Use the result only to get the limits you need by destructuring.
 * Thus, the result only needs to support destructuring. The current
 * implementation uses inheritance as a cheap hack.
 *
 * @param {Limits} [limits]
 * @returns {AllLimits}
 */
const limit = (limits = {}) =>
  /** @type {AllLimits} */ (harden({ __proto__: defaultLimits, ...limits }));

const checkIsWellFormedWithLimit = (
  payload,
  mainPayloadShape,
  check,
  label,
) => {
  assert(Array.isArray(mainPayloadShape));
  if (!Array.isArray(payload)) {
    return check(false, X`${q(label)} payload must be an array: ${payload}`);
  }

  // Was the following, but its overuse of patterns caused an infinite regress
  // const payloadLimitShape = harden(
  //   M.split(
  //     mainPayloadShape,
  //     M.partial(harden([M.recordOf(M.string(), M.number())]), harden([])),
  //   ),
  // );
  // return checkMatches(payload, payloadLimitShape, check, label);

  const mainLength = mainPayloadShape.length;
  if (!(payload.length === mainLength || payload.length === mainLength + 1)) {
    return check(false, X`${q(label)} payload unexpected size: ${payload}`);
  }
  const limits = payload[mainLength];
  payload = harden(payload.slice(0, mainLength));
  // eslint-disable-next-line no-use-before-define
  if (!checkMatches(payload, mainPayloadShape, check, label)) {
    return false;
  }
  if (limits === undefined) {
    return true;
  }
  return (
    (passStyleOf(limits) === 'copyRecord' ||
      check(false, X`Limits must be a record: ${q(limits)}`)) &&
    entries(limits).every(
      ([key, value]) =>
        passStyleOf(value) === 'number' ||
        check(false, X`Value of limit ${q(key)} but be a number: ${q(value)}`),
    )
  );
};

/**
 * @param {unknown} specimen
 * @param {number} decimalDigitsLimit
 * @param {Checker} check
 */
const checkDecimalDigitsLimit = (specimen, decimalDigitsLimit, check) => {
  if (
    Math.floor(Math.log10(Math.abs(Number(specimen)))) + 1 <=
    decimalDigitsLimit
  ) {
    return true;
  }
  return check(
    false,
    X`bigint ${specimen} must not have more than ${decimalDigitsLimit} digits`,
  );
};

/**
 * @returns {PatternKit}
 */
const makePatternKit = () => {
  /**
   * If this is a recognized match tag, return the MatchHelper.
   * Otherwise result undefined.
   *
   * @param {string} tag
   * @returns {MatchHelper | undefined}
   */
  const maybeMatchHelper = tag =>
    // eslint-disable-next-line no-use-before-define
    HelpersByMatchTag[tag];

  /**
   * @typedef {Exclude<PassStyle, 'tagged'> |
   *   'copySet' | 'copyBag' | 'copyMap' | keyof HelpersByMatchTag
   * } Kind
   * It is either a PassStyle other than 'tagged', or, if the underlying
   * PassStyle is 'tagged', then the `getTag` value for tags that are
   * recognized at the store level of abstraction. For each of those
   * tags, a tagged record only has that kind if it satisfies the invariants
   * that the store level associates with that kind.
   */

  /** @type {Map<Kind, unknown>} */
  const singletonKinds = new Map([
    ['null', null],
    ['undefined', undefined],
  ]);

  /**
   * @type {WeakMap<CopyTagged, Kind>}
   * Only for tagged records of recognized kinds whose store-level invariants
   * have already been checked.
   */
  const tagMemo = new WeakMap();

  /**
   * Checks only recognized tags, and only if the tagged
   * passes the invariants associated with that recognition.
   *
   * @param {Passable} tagged
   * @param {Kind} tag
   * @param {Checker} check
   * @returns {boolean}
   */
  const checkTagged = (tagged, tag, check) => {
    const matchHelper = maybeMatchHelper(tag);
    if (matchHelper) {
      // Buried here is the important case, where we process
      // the various patternNodes
      return matchHelper.checkIsWellFormed(tagged.payload, check);
    }
    switch (tag) {
      case 'copySet': {
        return checkCopySet(tagged, check);
      }
      case 'copyBag': {
        return checkCopyBag(tagged, check);
      }
      case 'copyMap': {
        return checkCopyMap(tagged, check);
      }
      default: {
        return check(
          false,
          X`cannot check unrecognized tag ${q(tag)}: ${tagged}`,
        );
      }
    }
  };

  /**
   * Returns only a recognized kind, and only if the specimen passes the
   * invariants associated with that recognition.
   * Otherwise, `check(false, ...)` and returns undefined
   *
   * @param {Passable} specimen
   * @param {Checker} [check]
   * @returns {Kind | undefined}
   */
  const kindOf = (specimen, check = identChecker) => {
    const passStyle = passStyleOf(specimen);
    if (passStyle !== 'tagged') {
      return passStyle;
    }
    // At this point we know that specimen is well formed
    // as a tagged record, which is defined at the marshal level of abstraction,
    // since `passStyleOf` checks those invariants.
    if (tagMemo.has(specimen)) {
      return tagMemo.get(specimen);
    }
    const tag = getTag(specimen);
    if (checkTagged(specimen, tag, check)) {
      tagMemo.set(specimen, tag);
      return tag;
    }
    if (check !== identChecker) {
      check(false, X`cannot check unrecognized tag ${q(tag)}`);
    }
    return undefined;
  };
  harden(kindOf);

  /**
   * Checks only recognized kinds, and only if the specimen
   * passes the invariants associated with that recognition.
   *
   * @param {Passable} specimen
   * @param {Kind} kind
   * @param {Checker} check
   * @returns {boolean}
   */
  const checkKind = (specimen, kind, check) => {
    // check null and undefined as Keys
    if (singletonKinds.has(kind)) {
      // eslint-disable-next-line no-use-before-define
      return checkAsKeyPatt(specimen, singletonKinds.get(kind), check);
    }

    const realKind = kindOf(specimen, check);
    if (kind === realKind) {
      return true;
    }
    if (check !== identChecker) {
      // `kind` and `realKind` can be embedded without quotes
      // because they are drawn from the enumerated collection of known Kinds.
      check(false, X`${b(realKind)} ${specimen} - Must be a ${b(kind)}`);
    }
    return false;
  };

  /**
   * Checks only recognized kinds, and only if the specimen
   * passes the invariants associated with that recognition.
   *
   * @param {Passable} specimen
   * @param {Kind} kind
   * @returns {boolean}
   */
  const isKind = (specimen, kind) => checkKind(specimen, kind, identChecker);

  /**
   * @param {Passable} specimen
   * @param {Key} keyAsPattern
   * @param {Checker} check
   * @returns {boolean}
   */
  const checkAsKeyPatt = (specimen, keyAsPattern, check) => {
    if (isKey(specimen) && keyEQ(specimen, keyAsPattern)) {
      return true;
    }
    return (
      check !== identChecker &&
      // When the mismatch occurs against a key used as a pattern,
      // the pattern should still be redacted.
      check(false, X`${specimen} - Must be: ${keyAsPattern}`)
    );
  };

  // /////////////////////// isPattern /////////////////////////////////////////

  /** @type {CheckPattern} */
  const checkPattern = (patt, check) => {
    if (isKey(patt)) {
      // All keys are patterns. For these, the keyMemo will do.
      // All primitives that are patterns are also keys, which this
      // also takes care of without memo. The rest of our checking logic
      // is only concerned with non-key patterns.
      return true;
    }
    if (patternMemo.has(patt)) {
      return true;
    }
    // eslint-disable-next-line no-use-before-define
    const result = checkPatternInternal(patt, check);
    if (result) {
      patternMemo.add(patt);
    }
    return result;
  };

  /**
   * @param {Passable} patt - known not to be a key, and therefore known
   * not to be primitive.
   * @param {Checker} check
   * @returns {boolean}
   */
  const checkPatternInternal = (patt, check) => {
    // Purposely parallels checkKey. TODO reuse more logic between them.
    // Most of the text of the switch below not dealing with matchers is
    // essentially identical.
    const checkIt = child => checkPattern(child, check);

    const kind = kindOf(patt, check);
    switch (kind) {
      case undefined: {
        return false;
      }
      case 'copyRecord': {
        // A copyRecord is a pattern iff all its children are
        // patterns
        return values(patt).every(checkIt);
      }
      case 'copyArray': {
        // A copyArray is a pattern iff all its children are
        // patterns
        return patt.every(checkIt);
      }
      case 'copyMap': {
        // A copyMap's keys are keys and therefore already known to be
        // patterns.
        // A copyMap is a pattern if its values are patterns.
        return checkPattern(patt.values, check);
      }
      case 'error':
      case 'promise': {
        return check(false, X`A ${q(kind)} cannot be a pattern`);
      }
      default: {
        if (maybeMatchHelper(kind) !== undefined) {
          return true;
        }
        return check(
          false,
          X`A passable of kind ${q(kind)} is not a pattern: ${patt}`,
        );
      }
    }
  };

  /**
   * @param {Passable} patt
   * @returns {boolean}
   */
  const isPattern = patt => checkPattern(patt, identChecker);

  /**
   * @param {Pattern} patt
   */
  const assertPattern = patt => {
    checkPattern(patt, assertChecker);
  };

  // /////////////////////// matches ///////////////////////////////////////////

  /**
   * @param {Passable} specimen
   * @param {Pattern} pattern
   * @param {Checker} check
   * @param {string|number} [label]
   * @returns {boolean}
   */
  const checkMatches = (specimen, pattern, check, label = undefined) =>
    // eslint-disable-next-line no-use-before-define
    applyLabelingError(checkMatchesInternal, [specimen, pattern, check], label);

  /**
   * @param {Passable} specimen
   * @param {Pattern} patt
   * @param {Checker} check
   * @returns {boolean}
   */
  const checkMatchesInternal = (specimen, patt, check) => {
    // Worth being a bit verbose and repetitive in order to optimize
    const patternKind = kindOf(patt, check);
    const specimenKind = kindOf(specimen); // may be undefined
    switch (patternKind) {
      case undefined: {
        return Fail`pattern expected: ${patt}`;
      }
      case 'promise': {
        return Fail`promises cannot be patterns: ${patt}`;
      }
      case 'error': {
        return Fail`errors cannot be patterns: ${patt}`;
      }
      case 'undefined':
      case 'null':
      case 'boolean':
      case 'number':
      case 'bigint':
      case 'string':
      case 'symbol':
      case 'copySet':
      case 'copyBag':
      case 'remotable': {
        // These kinds are necessarily keys
        return checkAsKeyPatt(specimen, patt, check);
      }
      case 'copyArray': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return checkAsKeyPatt(specimen, patt, check);
        }
        if (specimenKind !== 'copyArray') {
          return check(
            false,
            X`${specimen} - Must be a copyArray to match a copyArray pattern: ${q(
              patt,
            )}`,
          );
        }
        const { length } = patt;
        if (specimen.length !== length) {
          return check(
            false,
            X`Array ${specimen} - Must be as long as copyArray pattern: ${q(
              patt,
            )}`,
          );
        }
        return patt.every((p, i) => checkMatches(specimen[i], p, check, i));
      }
      case 'copyRecord': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return checkAsKeyPatt(specimen, patt, check);
        }
        if (specimenKind !== 'copyRecord') {
          return check(
            false,
            X`${specimen} - Must be a copyRecord to match a copyRecord pattern: ${q(
              patt,
            )}`,
          );
        }
        // TODO Detect and accumulate difference in one pass.
        // Rather than using two calls to `listDifference` to detect and
        // report if and how these lists differ, since they are already
        // in sorted order, we should instead use an algorithm like
        // `iterDisjointUnion` from merge-sort-operators.js
        const specimenNames = recordNames(specimen);
        const pattNames = recordNames(patt);
        const missing = listDifference(pattNames, specimenNames);
        if (missing.length >= 1) {
          return check(
            false,
            X`${specimen} - Must have missing properties ${q(missing)}`,
          );
        }
        const unexpected = listDifference(specimenNames, pattNames);
        if (unexpected.length >= 1) {
          return check(
            false,
            X`${specimen} - Must not have unexpected properties: ${q(
              unexpected,
            )}`,
          );
        }
        const specimenValues = recordValues(specimen, specimenNames);
        const pattValues = recordValues(patt, pattNames);
        return pattNames.every((label, i) =>
          checkMatches(specimenValues[i], pattValues[i], check, label),
        );
      }
      case 'copyMap': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return checkAsKeyPatt(specimen, patt, check);
        }
        if (specimenKind !== 'copyMap') {
          return check(
            false,
            X`${specimen} - Must be a copyMap to match a copyMap pattern: ${q(
              patt,
            )}`,
          );
        }
        const { payload: pattPayload } = patt;
        const { payload: specimenPayload } = specimen;
        const pattKeySet = copyMapKeySet(patt);
        const specimenKeySet = copyMapKeySet(specimen);
        // Compare keys as copySets
        if (!checkMatches(specimenKeySet, pattKeySet, check)) {
          return false;
        }
        const pattValues = pattPayload.values;
        const specimenValues = specimenPayload.values;
        // compare values as copyArrays
        // TODO BUG: this assumes that the keys appear in the
        // same order, so we can compare values in that order.
        // However, we're only guaranteed that they appear in
        // the same rankOrder. Thus we must search one of these
        // in the other's rankOrder.
        return checkMatches(specimenValues, pattValues, check);
      }
      default: {
        const matchHelper = maybeMatchHelper(patternKind);
        if (matchHelper) {
          return matchHelper.checkMatches(specimen, patt.payload, check);
        }
        throw Fail`internal: should have recognized ${q(patternKind)} `;
      }
    }
  };

  /**
   * @param {Passable} specimen
   * @param {Pattern} patt
   * @returns {boolean}
   */
  const matches = (specimen, patt) =>
    checkMatches(specimen, patt, identChecker);

  /**
   * Returning normally indicates success. Match failure is indicated by
   * throwing.
   *
   * @param {Passable} specimen
   * @param {Pattern} patt
   * @param {string|number} [label]
   */
  const mustMatch = (specimen, patt, label = undefined) => {
    if (checkMatches(specimen, patt, identChecker, label)) {
      return;
    }
    // should only throw
    checkMatches(specimen, patt, assertChecker, label);
    Fail`internal: ${label}: inconsistent pattern match: ${q(patt)}`;
  };

  // /////////////////////// getRankCover //////////////////////////////////////

  /** @type {GetRankCover} */
  const getRankCover = (patt, encodePassable) => {
    if (isKey(patt)) {
      const encoded = encodePassable(patt);
      if (encoded !== undefined) {
        return [encoded, `${encoded}~`];
      }
    }
    const passStyle = passStyleOf(patt);
    switch (passStyle) {
      case 'copyArray': {
        // XXX this doesn't get along with the world of cover === pair of
        // strings. In the meantime, fall through to the default which
        // returns a cover that covers all copyArrays.
        //
        // const rankCovers = patt.map(p => getRankCover(p, encodePassable));
        // return harden([
        //   rankCovers.map(([left, _right]) => left),
        //   rankCovers.map(([_left, right]) => right),
        // ]);
        break;
      }
      case 'copyRecord': {
        // XXX this doesn't get along with the world of cover === pair of
        // strings. In the meantime, fall through to the default which
        // returns a cover that covers all copyRecords.
        //
        // const pattKeys = ownKeys(patt);
        // const pattEntries = harden(pattKeys.map(key => [key, patt[key]]));
        // const [leftEntriesLimit, rightEntriesLimit] =
        //   getRankCover(pattEntries);
        // return harden([
        //   fromUniqueEntries(leftEntriesLimit),
        //   fromUniqueEntries(rightEntriesLimit),
        // ]);
        break;
      }
      case 'tagged': {
        const tag = getTag(patt);
        const matchHelper = maybeMatchHelper(tag);
        if (matchHelper) {
          // Buried here is the important case, where we process
          // the various patternNodes
          return matchHelper.getRankCover(patt.payload, encodePassable);
        }
        switch (tag) {
          case 'copySet': {
            // XXX this doesn't get along with the world of cover === pair of
            // strings. In the meantime, fall through to the default which
            // returns a cover that covers all copySets.
            //
            // // Should already be validated by checkPattern. But because this
            // // is a check that may loosen over time, we also assert
            // // everywhere we still rely on the restriction.
            // ```js
            // patt.payload.length === 1 ||
            //   Fail`Non-singleton copySets with matcher not yet implemented: ${patt}`;
            // ```
            //
            // const [leftElementLimit, rightElementLimit] = getRankCover(
            //   patt.payload[0],
            // );
            // return harden([
            //   makeCopySet([leftElementLimit]),
            //   makeCopySet([rightElementLimit]),
            // ]);
            break;
          }
          case 'copyMap': {
            // XXX this doesn't get along with the world of cover === pair of
            // strings. In the meantime, fall through to the default which
            // returns a cover that covers all copyMaps.
            //
            // // A matching copyMap must have the same keys, or at most one
            // // non-key key pattern. Thus we can assume that value positions
            // // match 1-to-1.
            // //
            // // TODO I may be overlooking that the less precise rankOrder
            // // equivalence class may cause values to be out of order,
            // // making this rankCover not actually cover. In that case, for
            // // all the values for keys at the same rank, we should union their
            // // rank covers. TODO POSSIBLE SILENT CORRECTNESS BUG
            // //
            // // If this is a bug, it probably affects the getRankCover
            // // cases of matchLTEHelper and matchGTEHelper on copyMap as
            // // well. See makeCopyMap for an idea on fixing
            // // this bug.
            // const [leftPayloadLimit, rightPayloadLimit] = getRankCover(
            //   patt.payload,
            //   encodePassable,
            // );
            // return harden([
            //   makeTagged('copyMap', leftPayloadLimit),
            //   makeTagged('copyMap', rightPayloadLimit),
            // ]);
            break;
          }
          default: {
            break; // fall through to default
          }
        }
        break; // fall through to default
      }
      default: {
        break; // fall through to default
      }
    }
    return getPassStyleCover(passStyle);
  };

  /**
   * @param {Passable[]} array
   * @param {Pattern} patt
   * @param {Checker} check
   * @param {string} [labelPrefix]
   * @returns {boolean}
   */
  const arrayEveryMatchPattern = (array, patt, check, labelPrefix = '') => {
    if (isKind(patt, 'match:any')) {
      // if the pattern is M.any(), we know its true
      return true;
    }
    return array.every((el, i) =>
      checkMatches(el, patt, check, `${labelPrefix}[${i}]`),
    );
  };

  // /////////////////////// Match Helpers /////////////////////////////////////

  /** @type {MatchHelper} */
  const matchAnyHelper = Far('match:any helper', {
    checkMatches: (_specimen, _matcherPayload, _check) => true,

    checkIsWellFormed: (matcherPayload, check) =>
      matcherPayload === undefined ||
      check(false, X`match:any payload: ${matcherPayload} - Must be undefined`),

    getRankCover: (_matchPayload, _encodePassable) => ['', '{'],
  });

  /** @type {MatchHelper} */
  const matchAndHelper = Far('match:and helper', {
    checkMatches: (specimen, patts, check) => {
      return patts.every(patt => checkMatches(specimen, patt, check));
    },

    checkIsWellFormed: (allegedPatts, check) => {
      const checkIt = patt => checkPattern(patt, check);
      return (
        (passStyleOf(allegedPatts) === 'copyArray' ||
          check(false, X`Needs array of sub-patterns: ${q(allegedPatts)}`)) &&
        allegedPatts.every(checkIt)
      );
    },

    getRankCover: (patts, encodePassable) =>
      intersectRankCovers(
        compareRank,
        patts.map(p => getRankCover(p, encodePassable)),
      ),
  });

  /** @type {MatchHelper} */
  const matchOrHelper = Far('match:or helper', {
    checkMatches: (specimen, patts, check) => {
      const { length } = patts;
      if (length === 0) {
        return check(
          false,
          X`${specimen} - no pattern disjuncts to match: ${q(patts)}`,
        );
      }
      if (
        patts.length === 2 &&
        !matches(specimen, patts[0]) &&
        isKind(patts[0], 'match:kind') &&
        patts[0].payload === 'undefined'
      ) {
        // Worth special casing the optional pattern for
        // better error messages.
        return checkMatches(specimen, patts[1], check);
      }
      if (patts.some(patt => matches(specimen, patt))) {
        return true;
      }
      return check(false, X`${specimen} - Must match one of ${q(patts)}`);
    },

    checkIsWellFormed: matchAndHelper.checkIsWellFormed,

    getRankCover: (patts, encodePassable) =>
      unionRankCovers(
        compareRank,
        patts.map(p => getRankCover(p, encodePassable)),
      ),
  });

  /** @type {MatchHelper} */
  const matchNotHelper = Far('match:not helper', {
    checkMatches: (specimen, patt, check) => {
      if (matches(specimen, patt)) {
        return check(
          false,
          X`${specimen} - Must fail negated pattern: ${q(patt)}`,
        );
      } else {
        return true;
      }
    },

    checkIsWellFormed: checkPattern,

    getRankCover: (_patt, _encodePassable) => ['', '{'],
  });

  /** @type {MatchHelper} */
  const matchScalarHelper = Far('match:scalar helper', {
    checkMatches: (specimen, _matcherPayload, check) =>
      checkScalarKey(specimen, check),

    checkIsWellFormed: matchAnyHelper.checkIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchKeyHelper = Far('match:key helper', {
    checkMatches: (specimen, _matcherPayload, check) =>
      checkKey(specimen, check),

    checkIsWellFormed: matchAnyHelper.checkIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchPatternHelper = Far('match:pattern helper', {
    checkMatches: (specimen, _matcherPayload, check) =>
      checkPattern(specimen, check),

    checkIsWellFormed: matchAnyHelper.checkIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchKindHelper = Far('match:kind helper', {
    checkMatches: checkKind,

    checkIsWellFormed: (allegedKeyKind, check) =>
      typeof allegedKeyKind === 'string' ||
      check(
        false,
        X`match:kind: payload: ${allegedKeyKind} - A kind name must be a string`,
      ),

    getRankCover: (kind, _encodePassable) => {
      let style;
      switch (kind) {
        case 'copySet':
        case 'copyMap': {
          style = 'tagged';
          break;
        }
        default: {
          style = kind;
          break;
        }
      }
      return getPassStyleCover(style);
    },
  });

  /** @type {MatchHelper} */
  const matchBigintHelper = Far('match:bigint helper', {
    checkMatches: (specimen, [limits = undefined], check) => {
      const { decimalDigitsLimit } = limit(limits);
      return (
        checkKind(specimen, 'bigint', check) &&
        checkDecimalDigitsLimit(specimen, decimalDigitsLimit, check)
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([]),
        check,
        'match:bigint payload',
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('bigint'),
  });

  /** @type {MatchHelper} */
  const matchNatHelper = Far('match:nat helper', {
    checkMatches: (specimen, [limits = undefined], check) => {
      const { decimalDigitsLimit } = limit(limits);
      return (
        checkKind(specimen, 'bigint', check) &&
        check(
          /** @type {bigint} */ (specimen) >= 0n,
          X`${specimen} - Must be non-negative`,
        ) &&
        checkDecimalDigitsLimit(specimen, decimalDigitsLimit, check)
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([]),
        check,
        'match:nat payload',
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      // TODO Could be more precise
      getPassStyleCover('bigint'),
  });

  /** @type {MatchHelper} */
  const matchStringHelper = Far('match:string helper', {
    checkMatches: (specimen, [limits = undefined], check) => {
      const { stringLengthLimit } = limit(limits);
      // prettier-ignore
      return (
        checkKind(specimen, 'string', check) &&
          // eslint-disable-next-line @endo/restrict-comparison-operands
          (/** @type {string} */ (specimen).length <= stringLengthLimit ||
          check(
            false,
            X`string ${specimen} must not be bigger than ${stringLengthLimit}`,
          ))
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([]),
        check,
        'match:string payload',
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('string'),
  });

  /** @type {MatchHelper} */
  const matchSymbolHelper = Far('match:symbol helper', {
    checkMatches: (specimen, [limits = undefined], check) => {
      const { symbolNameLengthLimit } = limit(limits);
      if (!checkKind(specimen, 'symbol', check)) {
        return false;
      }
      const symbolName = nameForPassableSymbol(specimen);

      if (typeof symbolName !== 'string') {
        throw Fail`internal: Passable symbol ${specimen} must have a passable name`;
      }
      return check(
        symbolName.length <= symbolNameLengthLimit,
        X`Symbol name ${q(
          symbolName,
        )} must not be bigger than ${symbolNameLengthLimit}`,
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([]),
        check,
        'match:symbol payload',
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('symbol'),
  });

  /** @type {MatchHelper} */
  const matchRemotableHelper = Far('match:remotable helper', {
    checkMatches: (specimen, remotableDesc, check) => {
      if (isKind(specimen, 'remotable')) {
        return true;
      }
      if (check === identChecker) {
        return false;
      }
      const { label } = remotableDesc;
      const passStyle = passStyleOf(specimen);
      const kindDetails =
        passStyle !== 'tagged'
          ? // Pass style can be embedded in details without quotes.
            b(passStyle)
          : // Tag must be quoted because it is potentially attacker-controlled
            // (unlike `kindOf`, this does not reject unrecognized tags).
            q(getTag(specimen));
      return check(
        false,
        // `label` can be embedded without quotes because it is provided by
        // local code like `M.remotable("...")`.
        X`${specimen} - Must be a remotable ${b(label)}, not ${kindDetails}`,
      );
    },

    checkIsWellFormed: (allegedRemotableDesc, check) =>
      checkMatches(
        allegedRemotableDesc,
        harden({ label: MM.string() }),
        check,
        'match:remotable payload',
      ),

    getRankCover: (_remotableDesc, _encodePassable) =>
      getPassStyleCover('remotable'),
  });

  /** @type {MatchHelper} */
  const matchLTEHelper = Far('match:lte helper', {
    checkMatches: (specimen, rightOperand, check) =>
      keyLTE(specimen, rightOperand) ||
      check(false, X`${specimen} - Must be <= ${rightOperand}`),

    checkIsWellFormed: checkKey,

    getRankCover: (rightOperand, encodePassable) => {
      const passStyle = passStyleOf(rightOperand);
      // The prefer-const makes no sense when some of the variables need
      // to be `let`
      // eslint-disable-next-line prefer-const
      let [leftBound, rightBound] = getPassStyleCover(passStyle);
      const newRightBound = `${encodePassable(rightOperand)}~`;
      if (newRightBound !== undefined) {
        rightBound = newRightBound;
      }
      return [leftBound, rightBound];
    },
  });

  /** @type {MatchHelper} */
  const matchLTHelper = Far('match:lt helper', {
    checkMatches: (specimen, rightOperand, check) =>
      keyLT(specimen, rightOperand) ||
      check(false, X`${specimen} - Must be < ${rightOperand}`),

    checkIsWellFormed: checkKey,

    getRankCover: matchLTEHelper.getRankCover,
  });

  /** @type {MatchHelper} */
  const matchGTEHelper = Far('match:gte helper', {
    checkMatches: (specimen, rightOperand, check) =>
      keyGTE(specimen, rightOperand) ||
      check(false, X`${specimen} - Must be >= ${rightOperand}`),

    checkIsWellFormed: checkKey,

    getRankCover: (rightOperand, encodePassable) => {
      const passStyle = passStyleOf(rightOperand);
      // The prefer-const makes no sense when some of the variables need
      // to be `let`
      // eslint-disable-next-line prefer-const
      let [leftBound, rightBound] = getPassStyleCover(passStyle);
      const newLeftBound = encodePassable(rightOperand);
      if (newLeftBound !== undefined) {
        leftBound = newLeftBound;
      }
      return [leftBound, rightBound];
    },
  });

  /** @type {MatchHelper} */
  const matchGTHelper = Far('match:gt helper', {
    checkMatches: (specimen, rightOperand, check) =>
      keyGT(specimen, rightOperand) ||
      check(false, X`${specimen} - Must be > ${rightOperand}`),

    checkIsWellFormed: checkKey,

    getRankCover: matchGTEHelper.getRankCover,
  });

  /** @type {MatchHelper} */
  const matchRecordOfHelper = Far('match:recordOf helper', {
    checkMatches: (
      specimen,
      [keyPatt, valuePatt, limits = undefined],
      check,
    ) => {
      const { numPropertiesLimit, propertyNameLengthLimit } = limit(limits);
      return (
        checkKind(specimen, 'copyRecord', check) &&
        check(
          ownKeys(specimen).length <= numPropertiesLimit,
          X`Must not have more than ${q(
            numPropertiesLimit,
          )} properties: ${specimen}`,
        ) &&
        entries(specimen).every(
          ([key, value]) =>
            applyLabelingError(
              check,
              [
                key.length <= propertyNameLengthLimit,
                X`Property name must not be longer than ${q(
                  propertyNameLengthLimit,
                )}`,
              ],
              key,
            ) &&
            checkMatches(
              harden([key, value]),
              harden([keyPatt, valuePatt]),
              check,
              key,
            ),
        )
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        check,
        'match:recordOf payload',
      ),

    getRankCover: _entryPatt => getPassStyleCover('copyRecord'),
  });

  /** @type {MatchHelper} */
  const matchArrayOfHelper = Far('match:arrayOf helper', {
    checkMatches: (specimen, [subPatt, limits = undefined], check) => {
      const { arrayLengthLimit } = limit(limits);
      // prettier-ignore
      return (
        checkKind(specimen, 'copyArray', check) &&
        (/** @type {Array} */ (specimen).length <= arrayLengthLimit ||
          check(
            false,
            X`Array length ${specimen.length} must be <= limit ${arrayLengthLimit}`,
          )) &&
        arrayEveryMatchPattern(specimen, subPatt, check)
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([MM.pattern()]),
        check,
        'match:arrayOf payload',
      ),

    getRankCover: () => getPassStyleCover('copyArray'),
  });

  /** @type {MatchHelper} */
  const matchSetOfHelper = Far('match:setOf helper', {
    checkMatches: (specimen, [keyPatt, limits = undefined], check) => {
      const { numSetElementsLimit } = limit(limits);
      return (
        checkKind(specimen, 'copySet', check) &&
        check(
          /** @type {Array} */ (specimen.payload).length < numSetElementsLimit,
          X`Set must not have more than ${q(numSetElementsLimit)} elements: ${
            specimen.payload.length
          }`,
        ) &&
        arrayEveryMatchPattern(specimen.payload, keyPatt, check, 'set elements')
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([MM.pattern()]),
        check,
        'match:setOf payload',
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchBagOfHelper = Far('match:bagOf helper', {
    checkMatches: (
      specimen,
      [keyPatt, countPatt, limits = undefined],
      check,
    ) => {
      const { numUniqueBagElementsLimit, decimalDigitsLimit } = limit(limits);
      return (
        checkKind(specimen, 'copyBag', check) &&
        check(
          /** @type {Array} */ (specimen.payload).length <=
            numUniqueBagElementsLimit,
          X`Bag must not have more than ${q(
            numUniqueBagElementsLimit,
          )} unique elements: ${specimen}`,
        ) &&
        specimen.payload.every(
          ([key, count], i) =>
            checkMatches(key, keyPatt, check, `bag keys[${i}]`) &&
            applyLabelingError(
              checkDecimalDigitsLimit,
              [count, decimalDigitsLimit, check],
              `bag counts[${i}]`,
            ) &&
            checkMatches(count, countPatt, check, `bag counts[${i}]`),
        )
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        check,
        'match:bagOf payload',
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchMapOfHelper = Far('match:mapOf helper', {
    checkMatches: (
      specimen,
      [keyPatt, valuePatt, limits = undefined],
      check,
    ) => {
      const { numMapEntriesLimit } = limit(limits);
      return (
        checkKind(specimen, 'copyMap', check) &&
        check(
          /** @type {Array} */ (specimen.payload.keys).length <=
            numMapEntriesLimit,
          X`CopyMap must have no more than ${q(
            numMapEntriesLimit,
          )} entries: ${specimen}`,
        ) &&
        arrayEveryMatchPattern(
          specimen.payload.keys,
          keyPatt,
          check,
          'map keys',
        ) &&
        arrayEveryMatchPattern(
          specimen.payload.values,
          valuePatt,
          check,
          'map values',
        )
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        check,
        'match:mapOf payload',
      ),

    getRankCover: _entryPatt => getPassStyleCover('tagged'),
  });

  /**
   * @param {Passable[]} specimen
   * @param {Pattern[]} requiredPatt
   * @param {Pattern[]} optionalPatt
   * @returns {{
   *   requiredSpecimen: Passable[],
   *   optionalSpecimen: Passable[],
   *   restSpecimen: Passable[]
   * }}
   */
  const splitArrayParts = (specimen, requiredPatt, optionalPatt) => {
    const numRequired = requiredPatt.length;
    const numOptional = optionalPatt.length;
    const requiredSpecimen = specimen.slice(0, numRequired);
    const optionalSpecimen = specimen.slice(
      numRequired,
      numRequired + numOptional,
    );
    const restSpecimen = specimen.slice(numRequired + numOptional);
    return harden({ requiredSpecimen, optionalSpecimen, restSpecimen });
  };

  /**
   * Optional specimen elements which are `undefined` pass unconditionally.
   * We encode this with the `M.or` pattern so it also produces a good
   * compression distinguishing `undefined` from absence.
   *
   * @param {Pattern[]} optionalPatt
   * @param {number} length
   * @returns {Pattern[]} The partialPatt
   */
  const adaptArrayPattern = (optionalPatt, length) =>
    harden(optionalPatt.slice(0, length).map(patt => MM.opt(patt)));

  /** @type {MatchHelper} */
  const matchSplitArrayHelper = Far('match:splitArray helper', {
    checkMatches: (
      specimen,
      [requiredPatt, optionalPatt = [], restPatt = MM.any()],
      check,
    ) => {
      if (!checkKind(specimen, 'copyArray', check)) {
        return false;
      }
      const { requiredSpecimen, optionalSpecimen, restSpecimen } =
        splitArrayParts(specimen, requiredPatt, optionalPatt);
      const partialPatt = adaptArrayPattern(
        optionalPatt,
        optionalSpecimen.length,
      );
      let argNum = 0;
      return (
        (requiredSpecimen.length === requiredPatt.length ||
          check(
            false,
            X`Expected at least ${q(
              requiredPatt.length,
            )} arguments: ${specimen}`,
          )) &&
        requiredPatt.every((p, i) =>
          // eslint-disable-next-line no-plusplus
          checkMatches(requiredSpecimen[i], p, check, `arg ${argNum++}`),
        ) &&
        partialPatt.every((p, i) =>
          // eslint-disable-next-line no-plusplus
          checkMatches(optionalSpecimen[i], p, check, `arg ${argNum++}?`),
        ) &&
        checkMatches(restSpecimen, restPatt, check, '...rest')
      );
    },

    /**
     * @param {Array} splitArray
     * @param {Checker} check
     */
    checkIsWellFormed: (splitArray, check) => {
      if (
        passStyleOf(splitArray) === 'copyArray' &&
        (splitArray.length >= 1 || splitArray.length <= 3)
      ) {
        const [requiredPatt, optionalPatt = undefined, restPatt = undefined] =
          splitArray;
        if (
          isPattern(requiredPatt) &&
          passStyleOf(requiredPatt) === 'copyArray' &&
          (optionalPatt === undefined ||
            (isPattern(optionalPatt) &&
              passStyleOf(optionalPatt) === 'copyArray')) &&
          (restPatt === undefined || isPattern(restPatt))
        ) {
          return true;
        }
      }
      return check(
        false,
        X`Must be an array of a requiredPatt array, an optional optionalPatt array, and an optional restPatt: ${q(
          splitArray,
        )}`,
      );
    },

    getRankCover: ([
      _requiredPatt,
      _optionalPatt = undefined,
      _restPatt = undefined,
    ]) => getPassStyleCover('copyArray'),
  });

  /**
   * @param {CopyRecord<Passable>} specimen
   * @param {CopyRecord<Pattern>} requiredPatt
   * @param {CopyRecord<Pattern>} optionalPatt
   * @returns {{
   *   requiredSpecimen: CopyRecord<Passable>,
   *   optionalSpecimen: CopyRecord<Passable>,
   *   restSpecimen: CopyRecord<Passable>
   * }}
   */
  const splitRecordParts = (specimen, requiredPatt, optionalPatt) => {
    // Not frozen! Mutated in place
    /** @type {[string, Passable][]} */
    const requiredEntries = [];
    /** @type {[string, Passable][]} */
    const optionalEntries = [];
    /** @type {[string, Passable][]} */
    const restEntries = [];
    for (const [name, value] of entries(specimen)) {
      if (hasOwnPropertyOf(requiredPatt, name)) {
        requiredEntries.push([name, value]);
      } else if (hasOwnPropertyOf(optionalPatt, name)) {
        optionalEntries.push([name, value]);
      } else {
        restEntries.push([name, value]);
      }
    }
    return harden({
      requiredSpecimen: fromUniqueEntries(requiredEntries),
      optionalSpecimen: fromUniqueEntries(optionalEntries),
      restSpecimen: fromUniqueEntries(restEntries),
    });
  };

  /**
   * Optional specimen values which are `undefined` pass unconditionally.
   * We encode this with the `M.or` pattern so it also produces a good
   * compression distinguishing `undefined` from absence.
   *
   * @param {CopyRecord<Pattern>} optionalPatt
   * @param {string[]} names
   * @returns {CopyRecord<Pattern>} The partialPatt
   */
  const adaptRecordPattern = (optionalPatt, names) =>
    fromUniqueEntries(names.map(name => [name, MM.opt(optionalPatt[name])]));

  /** @type {MatchHelper} */
  const matchSplitRecordHelper = Far('match:splitRecord helper', {
    checkMatches: (
      specimen,
      [requiredPatt, optionalPatt = {}, restPatt = MM.any()],
      check,
    ) => {
      if (!checkKind(specimen, 'copyRecord', check)) {
        return false;
      }
      const { requiredSpecimen, optionalSpecimen, restSpecimen } =
        splitRecordParts(specimen, requiredPatt, optionalPatt);

      const partialNames = /** @type {string[]} */ (ownKeys(optionalSpecimen));
      const partialPatt = adaptRecordPattern(optionalPatt, partialNames);
      return (
        checkMatches(requiredSpecimen, requiredPatt, check) &&
        partialNames.every(name =>
          checkMatches(
            optionalSpecimen[name],
            partialPatt[name],
            check,
            `${name}?`,
          ),
        ) &&
        checkMatches(restSpecimen, restPatt, check, '...rest')
      );
    },

    /**
     * @param {Array} splitArray
     * @param {Checker} check
     */
    checkIsWellFormed: (splitArray, check) => {
      if (
        passStyleOf(splitArray) === 'copyArray' &&
        (splitArray.length >= 1 || splitArray.length <= 3)
      ) {
        const [requiredPatt, optionalPatt = undefined, restPatt = undefined] =
          splitArray;
        if (
          isPattern(requiredPatt) &&
          passStyleOf(requiredPatt) === 'copyRecord' &&
          (optionalPatt === undefined ||
            (isPattern(optionalPatt) &&
              passStyleOf(optionalPatt) === 'copyRecord')) &&
          (restPatt === undefined || isPattern(restPatt))
        ) {
          return true;
        }
      }
      return check(
        false,
        X`Must be an array of a requiredPatt record, an optional optionalPatt record, and an optional restPatt: ${q(
          splitArray,
        )}`,
      );
    },

    getRankCover: ([
      requiredPatt,
      _optionalPatt = undefined,
      _restPatt = undefined,
    ]) => getPassStyleCover(passStyleOf(requiredPatt)),
  });

  /** @type {Record<string, MatchHelper>} */
  const HelpersByMatchTag = harden({
    'match:any': matchAnyHelper,
    'match:and': matchAndHelper,
    'match:or': matchOrHelper,
    'match:not': matchNotHelper,

    'match:scalar': matchScalarHelper,
    'match:key': matchKeyHelper,
    'match:pattern': matchPatternHelper,
    'match:kind': matchKindHelper,
    'match:bigint': matchBigintHelper,
    'match:nat': matchNatHelper,
    'match:string': matchStringHelper,
    'match:symbol': matchSymbolHelper,
    'match:remotable': matchRemotableHelper,

    'match:lt': matchLTHelper,
    'match:lte': matchLTEHelper,
    'match:gte': matchGTEHelper,
    'match:gt': matchGTHelper,

    'match:arrayOf': matchArrayOfHelper,
    'match:recordOf': matchRecordOfHelper,
    'match:setOf': matchSetOfHelper,
    'match:bagOf': matchBagOfHelper,
    'match:mapOf': matchMapOfHelper,
    'match:splitArray': matchSplitArrayHelper,
    'match:splitRecord': matchSplitRecordHelper,
  });

  const makeMatcher = (tag, payload) => {
    const matcher = makeTagged(tag, payload);
    assertPattern(matcher);
    return matcher;
  };

  const makeKindMatcher = kind => makeMatcher('match:kind', kind);

  const AnyShape = makeMatcher('match:any', undefined);
  const ScalarShape = makeMatcher('match:scalar', undefined);
  const KeyShape = makeMatcher('match:key', undefined);
  const PatternShape = makeMatcher('match:pattern', undefined);
  const BooleanShape = makeKindMatcher('boolean');
  const NumberShape = makeKindMatcher('number');
  const BigIntShape = makeTagged('match:bigint', []);
  const NatShape = makeTagged('match:nat', []);
  const StringShape = makeTagged('match:string', []);
  const SymbolShape = makeTagged('match:symbol', []);
  const RecordShape = makeTagged('match:recordOf', [AnyShape, AnyShape]);
  const ArrayShape = makeTagged('match:arrayOf', [AnyShape]);
  const SetShape = makeTagged('match:setOf', [AnyShape]);
  const BagShape = makeTagged('match:bagOf', [AnyShape, AnyShape]);
  const MapShape = makeTagged('match:mapOf', [AnyShape, AnyShape]);
  const RemotableShape = makeKindMatcher('remotable');
  const ErrorShape = makeKindMatcher('error');
  const PromiseShape = makeKindMatcher('promise');
  const UndefinedShape = makeKindMatcher('undefined');

  /**
   * For when the last element of the payload is the optional limits,
   * so that when it is `undefined` it is dropped from the end of the
   * payloads array.
   *
   * @param {string} tag
   * @param {Passable[]} payload
   */
  const makeLimitsMatcher = (tag, payload) => {
    if (payload[payload.length - 1] === undefined) {
      payload = harden(payload.slice(0, payload.length - 1));
    }
    return makeMatcher(tag, payload);
  };

  const makeRemotableMatcher = (label = undefined) =>
    label === undefined
      ? RemotableShape
      : makeMatcher('match:remotable', harden({ label }));

  /**
   * @template T
   * @param {T} empty
   * @param {T} base
   * @param {T} [optional]
   * @param {T} [rest]
   * @returns {T[]}
   */
  const makeSplitPayload = (
    empty,
    base,
    optional = undefined,
    rest = undefined,
  ) => {
    if (rest) {
      return [base, optional || empty, rest];
    }
    if (optional) {
      return [base, optional];
    }
    return [base];
  };

  // //////////////////

  /** @type {MatcherNamespace} */
  const M = harden({
    any: () => AnyShape,
    and: (...patts) => makeMatcher('match:and', patts),
    or: (...patts) => makeMatcher('match:or', patts),
    not: subPatt => makeMatcher('match:not', subPatt),

    scalar: () => ScalarShape,
    key: () => KeyShape,
    pattern: () => PatternShape,
    kind: makeKindMatcher,
    boolean: () => BooleanShape,
    number: () => NumberShape,
    bigint: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:bigint', [limits]) : BigIntShape,
    nat: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:nat', [limits]) : NatShape,
    string: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:string', [limits]) : StringShape,
    symbol: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:symbol', [limits]) : SymbolShape,
    record: (limits = undefined) =>
      limits ? M.recordOf(M.any(), M.any(), limits) : RecordShape,
    array: (limits = undefined) =>
      limits ? M.arrayOf(M.any(), limits) : ArrayShape,
    set: (limits = undefined) => (limits ? M.setOf(M.any(), limits) : SetShape),
    bag: (limits = undefined) =>
      limits ? M.bagOf(M.any(), M.any(), limits) : BagShape,
    map: (limits = undefined) =>
      limits ? M.mapOf(M.any(), M.any(), limits) : MapShape,
    remotable: makeRemotableMatcher,
    error: () => ErrorShape,
    promise: () => PromiseShape,
    undefined: () => UndefinedShape,
    null: () => null,

    lt: rightOperand => makeMatcher('match:lt', rightOperand),
    lte: rightOperand => makeMatcher('match:lte', rightOperand),
    eq: key => {
      assertKey(key);
      return key === undefined ? M.undefined() : key;
    },
    neq: key => M.not(M.eq(key)),
    gte: rightOperand => makeMatcher('match:gte', rightOperand),
    gt: rightOperand => makeMatcher('match:gt', rightOperand),

    recordOf: (keyPatt = M.any(), valuePatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:recordOf', [keyPatt, valuePatt, limits]),
    arrayOf: (subPatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:arrayOf', [subPatt, limits]),
    setOf: (keyPatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:setOf', [keyPatt, limits]),
    bagOf: (keyPatt = M.any(), countPatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:bagOf', [keyPatt, countPatt, limits]),
    mapOf: (keyPatt = M.any(), valuePatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:mapOf', [keyPatt, valuePatt, limits]),
    splitArray: (base, optional = undefined, rest = undefined) =>
      makeMatcher(
        'match:splitArray',
        makeSplitPayload([], base, optional, rest),
      ),
    splitRecord: (base, optional = undefined, rest = undefined) =>
      makeMatcher(
        'match:splitRecord',
        makeSplitPayload({}, base, optional, rest),
      ),
    split: (base, rest = undefined) => {
      if (passStyleOf(harden(base)) === 'copyArray') {
        // @ts-expect-error We know it should be an array
        return M.splitArray(base, rest && [], rest);
      } else {
        return M.splitRecord(base, rest && {}, rest);
      }
    },
    partial: (base, rest = undefined) => {
      if (passStyleOf(harden(base)) === 'copyArray') {
        // @ts-expect-error We know it should be an array
        return M.splitArray([], base, rest);
      } else {
        return M.splitRecord({}, base, rest);
      }
    },

    eref: t => M.or(t, M.promise()),
    opt: t => M.or(M.undefined(), t),

    interface: (interfaceName, methodGuards, options) =>
      // eslint-disable-next-line no-use-before-define
      makeInterfaceGuard(interfaceName, methodGuards, options),
    call: (...argPatterns) =>
      // eslint-disable-next-line no-use-before-define
      makeMethodGuardMaker('sync', argPatterns),
    callWhen: (...argGuards) =>
      // eslint-disable-next-line no-use-before-define
      makeMethodGuardMaker('async', argGuards),

    await: argPattern =>
      // eslint-disable-next-line no-use-before-define
      makeAwaitArgGuard(argPattern),
  });

  return harden({
    checkMatches,
    matches,
    mustMatch,
    assertPattern,
    isPattern,
    getRankCover,
    M,
  });
};

// Only include those whose meaning is independent of an imputed sort order
// of remotables, or of encoding of passable as sortable strings. Thus,
// getRankCover is omitted. To get one, you'd need to instantiate
// `makePatternKit()` yourself. Since there are currently no external
// uses of `getRankCover`, for clarity during development, `makePatternKit`
// is not currently exported.
export const {
  checkMatches,
  matches,
  mustMatch,
  assertPattern,
  isPattern,
  getRankCover,
  M,
} = makePatternKit();

MM = M;

// //////////////////////////// Guards ///////////////////////////////////////

const AwaitArgGuardShape = harden({
  klass: 'awaitArg',
  argGuard: M.pattern(),
});

export const isAwaitArgGuard = specimen =>
  matches(specimen, AwaitArgGuardShape);
harden(isAwaitArgGuard);

export const assertAwaitArgGuard = specimen => {
  mustMatch(specimen, AwaitArgGuardShape, 'awaitArgGuard');
};
harden(assertAwaitArgGuard);

/**
 * @param {Pattern} argPattern
 * @returns {AwaitArgGuard}
 */
const makeAwaitArgGuard = argPattern => {
  /** @type {AwaitArgGuard} */
  const result = harden({
    klass: 'awaitArg',
    argGuard: argPattern,
  });
  assertAwaitArgGuard(result);
  return result;
};

const PatternListShape = M.arrayOf(M.pattern());

const ArgGuardShape = M.or(M.pattern(), AwaitArgGuardShape);
const ArgGuardListShape = M.arrayOf(ArgGuardShape);

const SyncMethodGuardShape = harden({
  klass: 'methodGuard',
  callKind: 'sync',
  argGuards: PatternListShape,
  optionalArgGuards: M.opt(PatternListShape),
  restArgGuard: M.opt(M.pattern()),
  returnGuard: M.pattern(),
});

const AsyncMethodGuardShape = harden({
  klass: 'methodGuard',
  callKind: 'async',
  argGuards: ArgGuardListShape,
  optionalArgGuards: M.opt(ArgGuardListShape),
  restArgGuard: M.opt(M.pattern()),
  returnGuard: M.pattern(),
});

const MethodGuardShape = M.or(SyncMethodGuardShape, AsyncMethodGuardShape);

export const assertMethodGuard = specimen => {
  mustMatch(specimen, MethodGuardShape, 'methodGuard');
};
harden(assertMethodGuard);

/**
 * @param {'sync'|'async'} callKind
 * @param {ArgGuard[]} argGuards
 * @param {ArgGuard[]} [optionalArgGuards]
 * @param {ArgGuard} [restArgGuard]
 * @returns {MethodGuardMaker0}
 */
const makeMethodGuardMaker = (
  callKind,
  argGuards,
  optionalArgGuards = undefined,
  restArgGuard = undefined,
) =>
  harden({
    optional: (...optArgGuards) => {
      optionalArgGuards === undefined ||
        Fail`Can only have one set of optional guards`;
      restArgGuard === undefined ||
        Fail`optional arg guards must come before rest arg`;
      return makeMethodGuardMaker(callKind, argGuards, optArgGuards);
    },
    rest: rArgGuard => {
      restArgGuard === undefined || Fail`Can only have one rest arg`;
      return makeMethodGuardMaker(
        callKind,
        argGuards,
        optionalArgGuards,
        rArgGuard,
      );
    },
    returns: (returnGuard = M.undefined()) => {
      /** @type {MethodGuard} */
      const result = harden({
        klass: 'methodGuard',
        callKind,
        argGuards,
        optionalArgGuards,
        restArgGuard,
        returnGuard,
      });
      assertMethodGuard(result);
      return result;
    },
  });

const InterfaceGuardShape = M.splitRecord(
  {
    klass: 'Interface',
    interfaceName: M.string(),
    methodGuards: M.recordOf(M.string(), MethodGuardShape),
    sloppy: M.boolean(),
  },
  {
    symbolMethodGuards: M.mapOf(M.symbol(), MethodGuardShape),
  },
);

export const assertInterfaceGuard = specimen => {
  mustMatch(specimen, InterfaceGuardShape, 'interfaceGuard');
};
harden(assertInterfaceGuard);

/**
 * @param {string} interfaceName
 * @param {Record<string, MethodGuard>} methodGuards
 * @param {{sloppy?: boolean}} [options]
 * @returns {InterfaceGuard}
 */
const makeInterfaceGuard = (interfaceName, methodGuards, options = {}) => {
  const { sloppy = false } = options;
  // For backwards compatibility, string-keyed method guards are represented in
  // a CopyRecord. But symbol-keyed methods cannot be, so we put those in a
  // CopyMap when present.
  /** @type {Record<string, MethodGuard>} */
  const stringMethodGuards = {};
  /** @type {Array<[symbol, MethodGuard]>} */
  const symbolMethodGuardsEntries = [];
  for (const key of ownKeys(methodGuards)) {
    const value = methodGuards[/** @type {string} */ (key)];
    if (typeof key === 'symbol') {
      symbolMethodGuardsEntries.push([key, value]);
    } else {
      stringMethodGuards[key] = value;
    }
  }
  /** @type {InterfaceGuard} */
  const result = harden({
    klass: 'Interface',
    interfaceName,
    methodGuards: stringMethodGuards,
    ...(symbolMethodGuardsEntries.length
      ? { symbolMethodGuards: makeCopyMap(symbolMethodGuardsEntries) }
      : {}),
    sloppy,
  });
  assertInterfaceGuard(result);
  return result;
};
