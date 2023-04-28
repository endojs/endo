// @ts-nocheck So many errors that the suppressions hamper readability.
// TODO parameterize MatchHelper which will solve most of them
import {
  assertChecker,
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
import { identChecker } from '@endo/common/ident-checker.js';
import { applyLabelingError } from '@endo/common/apply-labeling-error.js';
import { fromUniqueEntries } from '@endo/common/from-unique-entries.js';
import { listDifference } from '@endo/common/list-difference.js';
import { objectMap } from '@endo/common/object-map.js';

import { q, b, X, Fail, makeError, annotateError } from '@endo/errors';
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
  getCopyMapEntryArray,
  makeCopyMap,
  makeCopySet,
  makeCopyBag,
} from '../keys/checkKey.js';
import { generateCollectionPairEntries } from '../keys/keycollection-operators.js';

/**
 * @import {Checker, CopyRecord, CopyTagged, Passable} from '@endo/pass-style'
 * @import {ArgGuard, AwaitArgGuard, CheckPattern, GetRankCover, InterfaceGuard, MatcherNamespace, MethodGuard, MethodGuardMaker, Pattern, RawGuard, SyncValueGuard, Kind, Compress, Decompress, Limits, AllLimits, Key, DefaultGuardType} from '../types.js'
 * @import {MatchHelper, PatternKit} from './types.js'
 */

const { entries, values } = Object;
const { ownKeys, apply } = Reflect;

// TODO simplify once we can assume Object.hasOwn everywhere. This probably
// means, when we stop supporting Node 14.
const { hasOwnProperty } = Object.prototype;
const hasOwn =
  Object.hasOwn || ((obj, name) => apply(hasOwnProperty, obj, [name]));

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
  // Define early to break a circularity is use of checkIsWellFormedWithLimit
  const PatternShape = makeTagged('match:pattern', undefined);

  // Define within makePatternKit so can use checkMatches early.
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
          check(
            false,
            X`Value of limit ${q(key)} but be a number: ${q(value)}`,
          ),
      )
    );
  };

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
   * Note that this function indicates absence by returning `undefined`,
   * even though `undefined` is a valid pattern. To evade this confusion,
   * to register a payload shape with that meaning, use `MM.undefined()`.
   *
   * @param {string} tag
   * @returns {Pattern | undefined}
   */
  const maybePayloadShape = tag =>
    // eslint-disable-next-line no-use-before-define
    GuardPayloadShapes[tag];

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
    } else {
      const payloadShape = maybePayloadShape(tag);
      if (payloadShape !== undefined) {
        // eslint-disable-next-line no-use-before-define
        return checkMatches(tagged.payload, payloadShape, check, tag);
      }
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
   * @param {any} specimen
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

  const matchHelperTagRE = harden(/^match:(\w+)(:\w+)?$/);

  const getMatchSubTag = tag => {
    const parts = matchHelperTagRE.exec(tag);
    if (parts && parts[2] !== undefined) {
      return `match:${parts[1]}`;
    } else {
      return undefined;
    }
  };

  /**
   * Checks only recognized kinds, and only if the specimen
   * passes the invariants associated with that recognition.
   *
   * @param {any} specimen
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
    if (realKind !== undefined) {
      if (kind === realKind) {
        return true;
      }
      const subTag = getMatchSubTag(realKind);
      if (subTag !== undefined && kind === subTag) {
        return true;
      }
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
   * @param {any} specimen
   * @param {Kind} kind
   * @returns {boolean}
   */
  const isKind = (specimen, kind) => checkKind(specimen, kind, identChecker);

  /**
   * @param {any} specimen
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
   * @param {any} specimen
   * @param {Pattern} pattern
   * @param {Checker} check
   * @param {string|number} [label]
   * @returns {boolean}
   */
  const checkMatches = (specimen, pattern, check, label = undefined) =>
    // eslint-disable-next-line no-use-before-define
    applyLabelingError(checkMatchesInternal, [specimen, pattern, check], label);

  /**
   * @param {any} specimen
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
        if (!isKey(specimen)) {
          assert(specimenKind !== patternKind);
          return check(
            false,
            X`${specimen} - Must be a ${patternKind} to match a ${patternKind} pattern: ${q(
              patt,
            )}`,
          );
        }
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
        // Compare keys as copySets
        const pattKeySet = copyMapKeySet(patt);
        const specimenKeySet = copyMapKeySet(specimen);
        if (!checkMatches(specimenKeySet, pattKeySet, check)) {
          return false;
        }
        // Compare values as copyArrays after applying a shared total order.
        // This is necessary because the antiRankOrder sorting of each map's
        // entries is a preorder that admits ties.
        const pattValues = [];
        const specimenValues = [];
        const entryPairs = generateCollectionPairEntries(
          patt,
          specimen,
          getCopyMapEntryArray,
          undefined,
        );
        for (const [_key, pattValue, specimenValue] of entryPairs) {
          pattValues.push(pattValue);
          specimenValues.push(specimenValue);
        }
        return checkMatches(harden(specimenValues), harden(pattValues), check);
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
   * @param {any} specimen
   * @param {Pattern} patt
   * @returns {boolean}
   */
  const matches = (specimen, patt) =>
    checkMatches(specimen, patt, identChecker);

  /**
   * Returning normally indicates success. Match failure is indicated by
   * throwing.
   *
   * @param {any} specimen
   * @param {Pattern} patt
   * @param {string|number} [label]
   */
  const mustMatch = (specimen, patt, label = undefined) => {
    let innerError;
    try {
      if (checkMatches(specimen, patt, identChecker, undefined)) {
        return;
      }
    } catch (er) {
      innerError = er;
    }
    // should only throw
    checkMatches(specimen, patt, assertChecker, label);
    const outerError = makeError(
      X`internal: ${label}: inconsistent pattern match: ${q(patt)}`,
    );
    if (innerError !== undefined) {
      annotateError(outerError, X`caused by ${innerError}`);
    }
    throw outerError;
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

  /**
   * @param {Passable[]} array
   * @param {Pattern} patt
   * @param {Compress} compress
   * @returns {Passable[] | undefined}
   */
  const arrayCompressMatchPattern = (array, patt, compress) => {
    if (isKind(patt, 'match:any')) {
      return array;
    }
    const bindings = [];
    for (const el of array) {
      const subCompressedRecord = compress(el, patt);
      if (subCompressedRecord) {
        bindings.push(subCompressedRecord.compressed);
      } else {
        return undefined;
      }
    }
    return harden(bindings);
  };

  /**
   * @param {Passable} compressed
   * @param {Pattern} patt
   * @param {Decompress} decompress
   * @returns {Passable[]}
   */
  const arrayDecompressMatchPattern = (compressed, patt, decompress) => {
    if (!Array.isArray(compressed)) {
      throw Fail`Compressed array must be an array: ${compressed}`;
    }
    if (isKind(patt, 'match:any')) {
      return compressed;
    }
    return harden(compressed.map(subBindings => decompress(subBindings, patt)));
  };

  // /////////////////////// Match Helpers /////////////////////////////////////

  /** @type {MatchHelper} */
  const matchAnyHelper = harden({
    tag: 'match:any',

    checkMatches: (_specimen, _matcherPayload, _check) => true,

    checkIsWellFormed: (matcherPayload, check) =>
      matcherPayload === undefined ||
      check(false, X`match:any payload: ${matcherPayload} - Must be undefined`),

    getRankCover: (_matchPayload, _encodePassable) => ['', '{'],
  });

  /** @type {MatchHelper} */
  const matchAndHelper = harden({
    tag: 'match:and:1',

    checkMatches: (specimen, patts, check) => {
      return patts.every(patt => checkMatches(specimen, patt, check));
    },

    // Compress only according to the last conjunct
    compress: (specimen, patts, compress) => {
      const { length } = patts;
      // We know there are at least two patts
      const lastPatt = patts[length - 1];
      const allButLast = patts.slice(0, length - 1);
      if (
        !allButLast.every(patt => checkMatches(specimen, patt, identChecker))
      ) {
        return undefined;
      }
      return compress(specimen, lastPatt);
    },

    decompress: (compressed, patts, decompress) => {
      const lastPatt = patts[patts.length - 1];
      return decompress(compressed, lastPatt);
    },

    checkIsWellFormed: (allegedPatts, check) => {
      const checkIt = patt => checkPattern(patt, check);
      return (
        (passStyleOf(allegedPatts) === 'copyArray' ||
          check(false, X`Needs array of sub-patterns: ${allegedPatts}`)) &&
        Array.isArray(allegedPatts) && // redundant. just for type checker
        (allegedPatts.length >= 2 ||
          check(false, X`Must have at least two sub-patterns`)) &&
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
  const matchOrHelper = harden({
    tag: 'match:or:1',

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
        patts[0] === undefined &&
        !matches(specimen, undefined)
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

    // Compress to an array pair of the index of the
    // first disjunct that succeeded, and the compressed according to
    // that disjunct.
    compress: (specimen, patts, compress) => {
      assert(Array.isArray(patts)); // redundant. Just for type checker.
      const { length } = patts;
      if (length === 0) {
        return undefined;
      }
      for (let i = 0; i < length; i += 1) {
        const subCompressedRecord = compress(specimen, patts[i]);
        if (subCompressedRecord !== undefined) {
          return harden({ compressed: [i, subCompressedRecord.compressed] });
        }
      }
      return undefined;
    },

    decompress: (compressed, patts, decompress) => {
      (Array.isArray(compressed) && compressed.length === 2) ||
        Fail`Or compression must be a case index and a compression by that case: ${compressed}`;
      const [i, subCompressed] = compressed;
      return decompress(harden(subCompressed), patts[i]);
    },

    checkIsWellFormed: matchAndHelper.checkIsWellFormed,

    getRankCover: (patts, encodePassable) =>
      unionRankCovers(
        compareRank,
        patts.map(p => getRankCover(p, encodePassable)),
      ),
  });

  /** @type {MatchHelper} */
  const matchNotHelper = harden({
    tag: 'match:not',

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
  const matchScalarHelper = harden({
    tag: 'match:scalar',

    checkMatches: (specimen, _matcherPayload, check) =>
      checkScalarKey(specimen, check),

    checkIsWellFormed: matchAnyHelper.checkIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchKeyHelper = harden({
    tag: `match:key`,

    checkMatches: (specimen, _matcherPayload, check) =>
      checkKey(specimen, check),

    checkIsWellFormed: matchAnyHelper.checkIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchPatternHelper = harden({
    tag: `match:pattern`,

    checkMatches: (specimen, _matcherPayload, check) =>
      checkPattern(specimen, check),

    checkIsWellFormed: matchAnyHelper.checkIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchKindHelper = harden({
    tag: `match:kind`,

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
  const matchTaggedHelper = harden({
    tag: `match:tagged:1`,

    checkMatches: (specimen, [tagPatt, payloadPatt], check) => {
      if (passStyleOf(specimen) !== 'tagged') {
        return check(
          false,
          X`Expected tagged object, not ${q(
            passStyleOf(specimen),
          )}: ${specimen}`,
        );
      }
      return (
        checkMatches(getTag(specimen), tagPatt, check, 'tag') &&
        checkMatches(specimen.payload, payloadPatt, check, 'payload')
      );
    },

    compress: (specimen, [tagPatt, payloadPatt], compress) => {
      if (passStyleOf(specimen) === 'tagged') {
        const compressedTagRecord = compress(getTag(specimen), tagPatt);
        if (!compressedTagRecord) {
          return undefined;
        }
        const compressedPayloadRecord = compress(specimen.payload, payloadPatt);
        if (!compressedPayloadRecord) {
          return undefined;
        }
        return harden({
          compressed: [
            compressedTagRecord.compressed,
            compressedPayloadRecord.compressed,
          ],
        });
      }
      return undefined;
    },

    decompress: (compressed, [tagPatt, payloadPatt], decompress) => {
      (Array.isArray(compressed) && compressed.length === 2) ||
        Fail`tagged compression must be a pair ${compressed}`;
      const [compressedTag, compressedPayload] = compressed;
      const tag = decompress(compressedTag, tagPatt);
      const payload = decompress(compressedPayload, payloadPatt);
      return makeTagged(tag, payload);
    },

    checkIsWellFormed: (payload, check) =>
      checkMatches(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        check,
        'match:tagged payload',
      ),

    getRankCover: (_kind, _encodePassable) => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchBigintHelper = harden({
    tag: `match:bigint`,

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
  const matchNatHelper = harden({
    tag: `match:nat`,

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
  const matchStringHelper = harden({
    tag: `match:string`,

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
  const matchSymbolHelper = harden({
    tag: `match:symbol`,

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
  const matchRemotableHelper = harden({
    tag: `match:remotable`,

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
  const matchLTEHelper = harden({
    tag: `match:lte`,

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
  const matchLTHelper = harden({
    tag: `match:lt`,

    checkMatches: (specimen, rightOperand, check) =>
      keyLT(specimen, rightOperand) ||
      check(false, X`${specimen} - Must be < ${rightOperand}`),

    checkIsWellFormed: checkKey,

    getRankCover: matchLTEHelper.getRankCover,
  });

  /** @type {MatchHelper} */
  const matchGTEHelper = harden({
    tag: `match:gte`,

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
  const matchGTHelper = harden({
    tag: `match:gt`,

    checkMatches: (specimen, rightOperand, check) =>
      keyGT(specimen, rightOperand) ||
      check(false, X`${specimen} - Must be > ${rightOperand}`),

    checkIsWellFormed: checkKey,

    getRankCover: matchGTEHelper.getRankCover,
  });

  /** @type {MatchHelper} */
  const matchRecordOfHelper = harden({
    tag: `match:recordOf`,

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
        harden([PatternShape, PatternShape]),
        check,
        'match:recordOf payload',
      ),

    getRankCover: _entryPatt => getPassStyleCover('copyRecord'),
  });

  /** @type {MatchHelper} */
  const matchArrayOfHelper = harden({
    tag: `match:arrayOf:1`,

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

    // Compress to an array of corresponding bindings arrays
    compress: (specimen, [subPatt, limits = undefined], compress) => {
      const { arrayLengthLimit } = limit(limits);
      if (
        isKind(specimen, 'copyArray') &&
        Array.isArray(specimen) && // redundant. just for type checker.
        specimen.length <= arrayLengthLimit
      ) {
        const compressed = arrayCompressMatchPattern(
          specimen,
          subPatt,
          compress,
        );
        if (compressed) {
          return harden({ compressed });
        }
      }
      return undefined;
    },

    decompress: (compressed, [subPatt, _limits = undefined], decompress) =>
      arrayDecompressMatchPattern(compressed, subPatt, decompress),

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([PatternShape]),
        check,
        'match:arrayOf payload',
      ),

    getRankCover: () => getPassStyleCover('copyArray'),
  });

  /** @type {MatchHelper} */
  const matchSetOfHelper = harden({
    tag: `match:setOf:1`,

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

    // Compress to an array of corresponding bindings arrays
    compress: (specimen, [keyPatt, limits = undefined], compress) => {
      const { numSetElementsLimit } = limit(limits);
      if (
        isKind(specimen, 'copySet') &&
        /** @type {Array} */ (specimen.payload).length <= numSetElementsLimit
      ) {
        const compressed = arrayCompressMatchPattern(
          specimen.payload,
          keyPatt,
          compress,
        );
        if (compressed) {
          return harden({ compressed });
        }
      }
      return undefined;
    },

    decompress: (compressed, [keyPatt, _limits = undefined], decompress) =>
      makeCopySet(arrayDecompressMatchPattern(compressed, keyPatt, decompress)),

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([PatternShape]),
        check,
        'match:setOf payload',
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchBagOfHelper = harden({
    tag: `match:bagOf:1`,

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

    // Compress to an array of corresponding bindings arrays
    compress: (
      specimen,
      [keyPatt, countPatt, limits = undefined],
      compress,
    ) => {
      const { numUniqueBagElementsLimit, decimalDigitsLimit } = limit(limits);
      if (
        isKind(specimen, 'copyBag') &&
        /** @type {Array} */ (specimen.payload).length <=
          numUniqueBagElementsLimit &&
        specimen.payload.every(([_key, count]) =>
          checkDecimalDigitsLimit(count, decimalDigitsLimit, identChecker),
        )
      ) {
        const compressed = arrayCompressMatchPattern(
          specimen.payload,
          harden([keyPatt, countPatt]),
          compress,
        );
        if (compressed) {
          return harden({ compressed });
        }
      }
      return undefined;
    },

    decompress: (
      compressed,
      [keyPatt, countPatt, _limits = undefined],
      decompress,
    ) =>
      makeCopyBag(
        arrayDecompressMatchPattern(
          compressed,
          harden([keyPatt, countPatt]),
          decompress,
        ),
      ),

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([PatternShape, PatternShape]),
        check,
        'match:bagOf payload',
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchMapOfHelper = harden({
    tag: `match:mapOf:1`,

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

    // Compress to a pair of bindings arrays, one for the keys
    // and a matching one for the values.
    compress: (
      specimen,
      [keyPatt, valuePatt, limits = undefined],
      compress,
    ) => {
      const { numMapEntriesLimit } = limit(limits);
      if (
        isKind(specimen, 'copyMap') &&
        /** @type {Array} */ (specimen.payload.keys).length <=
          numMapEntriesLimit
      ) {
        const compressedKeys = arrayCompressMatchPattern(
          specimen.payload.keys,
          keyPatt,
          compress,
        );
        if (compressedKeys) {
          const compressedValues = arrayCompressMatchPattern(
            specimen.payload.values,
            valuePatt,
            compress,
          );
          if (compressedValues) {
            return harden({
              compressed: [compressedKeys, compressedValues],
            });
          }
        }
      }
      return undefined;
    },

    decompress: (
      compressed,
      [keyPatt, valuePatt, _limits = undefined],
      decompress,
    ) => {
      (Array.isArray(compressed) && compressed.length === 2) ||
        Fail`Compressed map should be a pair of compressed keys and compressed values ${compressed}`;
      const [compressedKeys, compressedvalues] = compressed;
      return makeTagged(
        'copyMap',
        harden({
          keys: arrayDecompressMatchPattern(
            compressedKeys,
            keyPatt,
            decompress,
          ),
          values: arrayDecompressMatchPattern(
            compressedvalues,
            valuePatt,
            decompress,
          ),
        }),
      );
    },

    checkIsWellFormed: (payload, check) =>
      checkIsWellFormedWithLimit(
        payload,
        harden([PatternShape, PatternShape]),
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
  const matchSplitArrayHelper = harden({
    tag: `match:splitArray:1`,

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

    compress: (
      specimen,
      [requiredPatt, optionalPatt = [], restPatt = MM.any()],
      compress,
    ) => {
      if (!checkKind(specimen, 'copyArray', identChecker)) {
        return undefined;
      }
      const { requiredSpecimen, optionalSpecimen, restSpecimen } =
        splitArrayParts(specimen, requiredPatt, optionalPatt);
      const partialPatt = adaptArrayPattern(
        optionalPatt,
        optionalSpecimen.length,
      );
      const compressedRequired = compress(requiredSpecimen, requiredPatt);
      if (!compressedRequired) {
        return undefined;
      }
      const compressedPartial = [];
      for (const [i, p] of entries(partialPatt)) {
        const compressedField = compress(optionalSpecimen[i], p);
        if (!compressedField) {
          // imperative loop so can escape early
          return undefined;
        }
        compressedPartial.push(compressedField.compressed[0]);
      }
      const compressedRest = compress(restSpecimen, restPatt);
      if (!compressedRest) {
        return undefined;
      }
      return harden({
        compressed: [
          compressedRequired.compressed,
          compressedPartial,
          compressedRest.compressed,
        ],
      });
    },

    decompress: (
      compressed,
      [requiredPatt, optionalPatt = [], restPatt = MM.any()],
      decompress,
    ) => {
      (Array.isArray(compressed) && compressed.length === 3) ||
        Fail`splitArray compression must be a triple ${compressed}`;
      const [compressRequired, compressPartial, compressedRest] = compressed;
      const partialPatt = adaptArrayPattern(
        optionalPatt,
        compressPartial.length,
      );
      const requiredParts = decompress(compressRequired, requiredPatt);
      // const optionalParts = decompress(compressPartial, partialPatt);
      const optionalParts = [];
      for (const [i, p] of entries(partialPatt)) {
        // imperative loop just for similarity to compression code
        const optionalField = decompress(harden([compressPartial[i]]), p);
        optionalParts.push(optionalField);
      }
      const restParts = decompress(compressedRest, restPatt);
      return harden([...requiredParts, ...optionalParts, ...restParts]);
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
   * @returns {CopyRecord<Pattern>} The partialPatt
   */
  const adaptRecordPattern = optionalPatt =>
    objectMap(optionalPatt, p => MM.opt(p));

  /** @type {MatchHelper} */
  const matchSplitRecordHelper = harden({
    tag: `match:splitRecord:1`,

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

      const partialNames = recordNames(optionalSpecimen);
      const partialPatt = adaptRecordPattern(optionalPatt);
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

    compress: (
      specimen,
      [requiredPatt, optionalPatt = {}, restPatt = MM.any()],
      compress,
    ) => {
      if (!checkKind(specimen, 'copyRecord', identChecker)) {
        return undefined;
      }
      const { requiredSpecimen, optionalSpecimen, restSpecimen } =
        splitRecordParts(specimen, requiredPatt, optionalPatt);
      const partialPatt = adaptRecordPattern(optionalPatt);

      const compressedRequired = compress(requiredSpecimen, requiredPatt);
      if (!compressedRequired) {
        return undefined;
      }
      const optionalNames = recordNames(partialPatt);
      const compressedPartial = [];
      for (const name of optionalNames) {
        if (hasOwn(optionalSpecimen, name)) {
          const compressedField = compress(
            optionalSpecimen[name],
            partialPatt[name],
          );
          if (!compressedField) {
            return undefined;
          }
          compressedPartial.push(compressedField.compressed[0]);
        } else {
          compressedPartial.push(null);
        }
      }
      const compressedRest = compress(restSpecimen, restPatt);
      if (!compressedRest) {
        return undefined;
      }
      return harden({
        compressed: [
          compressedRequired.compressed,
          compressedPartial,
          compressedRest.compressed,
        ],
      });
    },

    decompress: (
      compressed,
      [requiredPatt, optionalPatt = {}, restPatt = MM.any()],
      decompress,
    ) => {
      (Array.isArray(compressed) && compressed.length === 3) ||
        Fail`splitRecord compression must be a triple ${compressed}`;
      const [compressedRequired, compressedPartial, compressedRest] =
        compressed;
      const partialPatt = adaptRecordPattern(optionalPatt);
      const requiredEntries = entries(
        decompress(compressedRequired, requiredPatt),
      );
      const optionalNames = recordNames(partialPatt);
      compressedPartial.length === optionalNames.length ||
        Fail`compression or patterns must preserve cardinality: ${compressedPartial}`;
      /** @type {[string, Passable][]} */
      const optionalEntries = [];
      for (const [i, name] of entries(optionalNames)) {
        const p = partialPatt[name];
        const c = compressedPartial[i];
        if (c !== null) {
          const u = decompress(harden([c]), p);
          optionalEntries.push([name, u]);
        }
      }
      const restEntries = entries(decompress(compressedRest, restPatt));

      const allEntries = [
        ...requiredEntries,
        ...optionalEntries,
        ...restEntries,
      ];
      return fromUniqueEntries(allEntries);
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

  const makeHelpersTable = () => {
    const helpers = harden([
      matchAnyHelper,
      matchAndHelper,
      matchOrHelper,
      matchNotHelper,

      matchScalarHelper,
      matchKeyHelper,
      matchPatternHelper,
      matchKindHelper,
      matchTaggedHelper,
      matchBigintHelper,
      matchNatHelper,
      matchStringHelper,
      matchSymbolHelper,
      matchRemotableHelper,

      matchLTHelper,
      matchLTEHelper,
      matchGTEHelper,
      matchGTHelper,

      matchArrayOfHelper,
      matchRecordOfHelper,
      matchSetOfHelper,
      matchBagOfHelper,
      matchMapOfHelper,
      matchSplitArrayHelper,
      matchSplitRecordHelper,
    ]);

    /** @type {Record<string, MatchHelper>} */
    // don't freeze yet
    const helpersByMatchTag = {};

    for (const helper of helpers) {
      const { tag, compress, decompress, ...rest } = helper;
      if (!matchHelperTagRE.test(tag)) {
        throw Fail`malformed matcher tag ${q(tag)}`;
      }
      const subTag = getMatchSubTag(tag);
      if (subTag === undefined) {
        (compress === undefined && decompress === undefined) ||
          Fail`internal: compressing helper must have compression version ${q(
            tag,
          )}`;
      } else {
        (typeof compress === 'function' && typeof decompress === 'function') ||
          Fail`internal: expected compression methods ${q(tag)})`;
        helpersByMatchTag[subTag] = { tag: subTag, ...rest };
      }
      helpersByMatchTag[tag] = helper;
    }
    return harden(helpersByMatchTag);
  };

  /** @type {Record<string, MatchHelper>} */
  const HelpersByMatchTag = makeHelpersTable();

  /**
   * @param {MatchHelper} matchHelper
   * @param {Passable} payload
   */
  const makeMatcher = (matchHelper, payload) => {
    const matcher = makeTagged(matchHelper.tag, payload);
    assertPattern(matcher);
    return matcher;
  };

  const makeKindMatcher = kind => makeMatcher(matchKindHelper, kind);

  // Note that PatternShape was defined above to break a circularity.

  const AnyShape = makeMatcher(matchAnyHelper, undefined);
  const ScalarShape = makeMatcher(matchScalarHelper, undefined);
  const KeyShape = makeMatcher(matchKeyHelper, undefined);
  const BooleanShape = makeKindMatcher('boolean');
  const NumberShape = makeKindMatcher('number');
  const BigIntShape = makeMatcher(matchBigintHelper, []);
  const NatShape = makeMatcher(matchNatHelper, []);
  const StringShape = makeMatcher(matchStringHelper, []);
  const SymbolShape = makeMatcher(matchSymbolHelper, []);
  const RecordShape = makeMatcher(matchRecordOfHelper, [AnyShape, AnyShape]);
  const ArrayShape = makeMatcher(matchArrayOfHelper, [AnyShape]);
  const SetShape = makeMatcher(matchSetOfHelper, [AnyShape]);
  const BagShape = makeMatcher(matchBagOfHelper, [AnyShape, AnyShape]);
  const MapShape = makeMatcher(matchMapOfHelper, [AnyShape, AnyShape]);
  const RemotableShape = makeKindMatcher('remotable');
  const ErrorShape = makeKindMatcher('error');
  const PromiseShape = makeKindMatcher('promise');
  const UndefinedShape = makeKindMatcher('undefined');
  const NullShape = makeKindMatcher('null');

  /**
   * For when the last element of the payload is the optional limits,
   * so that when it is `undefined` it is dropped from the end of the
   * payloads array.
   *
   * @param {MatchHelper} matchHelper
   * @param {Passable[]} payload
   */
  const makeLimitsMatcher = (matchHelper, payload) => {
    if (payload[payload.length - 1] === undefined) {
      payload = harden(payload.slice(0, payload.length - 1));
    }
    return makeMatcher(matchHelper, payload);
  };

  const makeRemotableMatcher = (label = undefined) =>
    label === undefined
      ? RemotableShape
      : makeMatcher(matchRemotableHelper, harden({ label }));

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
    and: (...patts) =>
      // eslint-disable-next-line no-nested-ternary
      patts.length === 0
        ? M.any()
        : patts.length === 1
          ? patts[0]
          : makeMatcher(matchAndHelper, patts),
    or: (...patts) =>
      // eslint-disable-next-line no-nested-ternary
      patts.length === 0
        ? M.not(M.any())
        : patts.length === 1
          ? patts[0]
          : makeMatcher(matchOrHelper, patts),
    not: subPatt => makeMatcher(matchNotHelper, subPatt),

    scalar: () => ScalarShape,
    key: () => KeyShape,
    pattern: () => PatternShape,
    kind: makeKindMatcher,
    tagged: (tagPatt = M.string(), payloadPatt = M.any()) =>
      makeMatcher(matchTaggedHelper, harden([tagPatt, payloadPatt])),
    boolean: () => BooleanShape,
    number: () => NumberShape,
    bigint: (limits = undefined) =>
      limits ? makeLimitsMatcher(matchBigintHelper, [limits]) : BigIntShape,
    nat: (limits = undefined) =>
      limits ? makeLimitsMatcher(matchNatHelper, [limits]) : NatShape,
    string: (limits = undefined) =>
      limits ? makeLimitsMatcher(matchStringHelper, [limits]) : StringShape,
    symbol: (limits = undefined) =>
      limits ? makeLimitsMatcher(matchSymbolHelper, [limits]) : SymbolShape,
    record: (limits = undefined) =>
      limits ? M.recordOf(M.any(), M.any(), limits) : RecordShape,
    // struct: A pattern that matches CopyRecords with a fixed quantity of
    // entries where the values match patterns for corresponding keys is merely
    // a hardened object with patterns in the places of values for
    // corresponding keys.
    // For example, a pattern that matches CopyRecords that have a string value
    // for the key 'x' and a number for the key 'y' is:
    // harden({ x: M.string(), y: M.number() }).
    array: (limits = undefined) =>
      limits ? M.arrayOf(M.any(), limits) : ArrayShape,
    // tuple: A pattern that matches CopyArrays with a fixed quantity of values
    // that match a heterogeneous array of patterns is merely a hardened array
    // of the respective patterns.
    // For example, a pattern that matches CopyArrays of length 2 that have a
    // string at index 0 and a number at index 1 is:
    // harden([ M.string(), M.number() ]).
    set: (limits = undefined) => (limits ? M.setOf(M.any(), limits) : SetShape),
    bag: (limits = undefined) =>
      limits ? M.bagOf(M.any(), M.any(), limits) : BagShape,
    map: (limits = undefined) =>
      limits ? M.mapOf(M.any(), M.any(), limits) : MapShape,
    // heterogeneous map: A pattern that matches CopyMaps with a fixed quantity
    // of entries where the value for each key matches a corresponding pattern
    // is merely a (hardened) CopyMap with patterns instead of values for the
    // corresponding keys.
    // For example, a pattern that matches CopyMaps where the value for the key
    // 'x' is a number and the value for the key 'y' is a string is:
    // makeCopyMap([['x', M.number()], ['y', M.string()]]).
    remotable: makeRemotableMatcher,
    error: () => ErrorShape,
    promise: () => PromiseShape,
    undefined: () => UndefinedShape,
    null: () => NullShape,

    lt: rightOperand => makeMatcher(matchLTHelper, rightOperand),
    lte: rightOperand => makeMatcher(matchLTEHelper, rightOperand),
    eq: key => {
      assertKey(key);
      return key === undefined ? M.undefined() : key;
    },
    neq: key => M.not(M.eq(key)),
    gte: rightOperand => makeMatcher(matchGTEHelper, rightOperand),
    gt: rightOperand => makeMatcher(matchGTHelper, rightOperand),

    recordOf: (keyPatt = M.any(), valuePatt = M.any(), limits = undefined) =>
      makeLimitsMatcher(matchRecordOfHelper, [keyPatt, valuePatt, limits]),
    arrayOf: (subPatt = M.any(), limits = undefined) =>
      makeLimitsMatcher(matchArrayOfHelper, [subPatt, limits]),
    setOf: (keyPatt = M.any(), limits = undefined) =>
      makeLimitsMatcher(matchSetOfHelper, [keyPatt, limits]),
    bagOf: (keyPatt = M.any(), countPatt = M.any(), limits = undefined) =>
      makeLimitsMatcher(matchBagOfHelper, [keyPatt, countPatt, limits]),
    mapOf: (keyPatt = M.any(), valuePatt = M.any(), limits = undefined) =>
      makeLimitsMatcher(matchMapOfHelper, [keyPatt, valuePatt, limits]),
    splitArray: (base, optional = undefined, rest = undefined) =>
      makeMatcher(
        matchSplitArrayHelper,
        makeSplitPayload([], base, optional, rest),
      ),
    splitRecord: (base, optional = undefined, rest = undefined) =>
      makeMatcher(
        matchSplitRecordHelper,
        makeSplitPayload({}, base, optional, rest),
      ),
    split: (base, rest = undefined) => {
      if (passStyleOf(harden(base)) === 'copyArray') {
        // TODO at-ts-expect-error works locally but not from @endo/exo
        // @ts-expect-error We know it should be an array
        return M.splitArray(base, rest && [], rest);
      } else {
        return M.splitRecord(base, rest && {}, rest);
      }
    },
    partial: (base, rest = undefined) => {
      if (passStyleOf(harden(base)) === 'copyArray') {
        // TODO at-ts-expect-error works locally but not from @endo/exo
        // @ts-expect-error We know it should be an array
        return M.splitArray([], base, rest);
      } else {
        return M.splitRecord({}, base, rest);
      }
    },

    eref: t => M.or(t, M.promise()),
    // `undefined` compresses better than `M.undefined()`
    opt: t => M.or(undefined, t),

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
    raw: () =>
      // eslint-disable-next-line no-use-before-define
      makeRawGuard(),
  });

  return harden({
    checkMatches,
    matches,
    mustMatch,
    assertPattern,
    isPattern,
    getRankCover,
    maybeMatchHelper,
    M,
    kindOf,
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
  maybeMatchHelper,
  M,
  kindOf,
} = makePatternKit();

MM = M;

// //////////////////////////// Guards ///////////////////////////////////////

// M.await(...)
const AwaitArgGuardPayloadShape = harden({
  argGuard: M.pattern(),
});

export const AwaitArgGuardShape = M.kind('guard:awaitArgGuard');

/**
 * @param {any} specimen
 * @returns {specimen is AwaitArgGuard}
 */
export const isAwaitArgGuard = specimen =>
  matches(specimen, AwaitArgGuardShape);
harden(isAwaitArgGuard);

/**
 * @param {any} specimen
 * @returns {asserts specimen is AwaitArgGuard}
 */
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
  const result = makeTagged('guard:awaitArgGuard', {
    argGuard: argPattern,
  });
  assertAwaitArgGuard(result);
  return result;
};

// M.raw()

const RawGuardPayloadShape = M.record();

export const RawGuardShape = M.kind('guard:rawGuard');

export const isRawGuard = specimen => matches(specimen, RawGuardShape);

export const assertRawGuard = specimen =>
  mustMatch(specimen, RawGuardShape, 'rawGuard');

/**
 * @returns {RawGuard}
 */
const makeRawGuard = () => makeTagged('guard:rawGuard', {});

// M.call(...)
// M.callWhen(...)

export const SyncValueGuardShape = M.or(RawGuardShape, M.pattern());

export const SyncValueGuardListShape = M.arrayOf(SyncValueGuardShape);

const ArgGuardShape = M.or(RawGuardShape, AwaitArgGuardShape, M.pattern());
export const ArgGuardListShape = M.arrayOf(ArgGuardShape);

const SyncMethodGuardPayloadShape = harden({
  callKind: 'sync',
  argGuards: SyncValueGuardListShape,
  optionalArgGuards: M.opt(SyncValueGuardListShape),
  restArgGuard: M.opt(SyncValueGuardShape),
  returnGuard: SyncValueGuardShape,
});

const AsyncMethodGuardPayloadShape = harden({
  callKind: 'async',
  argGuards: ArgGuardListShape,
  optionalArgGuards: M.opt(ArgGuardListShape),
  restArgGuard: M.opt(SyncValueGuardShape),
  returnGuard: SyncValueGuardShape,
});

export const MethodGuardPayloadShape = M.or(
  SyncMethodGuardPayloadShape,
  AsyncMethodGuardPayloadShape,
);

export const MethodGuardShape = M.kind('guard:methodGuard');

/**
 * @param {any} specimen
 * @returns {asserts specimen is MethodGuard}
 */
export const assertMethodGuard = specimen => {
  mustMatch(specimen, MethodGuardShape, 'methodGuard');
};
harden(assertMethodGuard);

/**
 * @param {'sync'|'async'} callKind
 * @param {ArgGuard[]} argGuards
 * @param {ArgGuard[]} [optionalArgGuards]
 * @param {SyncValueGuard} [restArgGuard]
 * @returns {MethodGuardMaker}
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
      const result = makeTagged('guard:methodGuard', {
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

export const InterfaceGuardPayloadShape = M.splitRecord(
  {
    interfaceName: M.string(),
    methodGuards: M.recordOf(M.string(), MethodGuardShape),
  },
  {
    defaultGuards: M.or(M.undefined(), 'passable', 'raw'),
    sloppy: M.boolean(),
    symbolMethodGuards: M.mapOf(M.symbol(), MethodGuardShape),
  },
);

export const InterfaceGuardShape = M.kind('guard:interfaceGuard');

/**
 * @param {any} specimen
 * @returns {asserts specimen is InterfaceGuard}
 */
export const assertInterfaceGuard = specimen => {
  mustMatch(specimen, InterfaceGuardShape, 'interfaceGuard');
};
harden(assertInterfaceGuard);

/**
 * @template {Record<PropertyKey, MethodGuard>} [M = Record<PropertyKey, MethodGuard>]
 * @param {string} interfaceName
 * @param {M} methodGuards
 * @param {{ sloppy?: boolean, defaultGuards?: DefaultGuardType }} [options]
 * @returns {InterfaceGuard<M>}
 */
const makeInterfaceGuard = (interfaceName, methodGuards, options = {}) => {
  const { sloppy = false, defaultGuards = sloppy ? 'passable' : undefined } =
    options;
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
  const result = makeTagged('guard:interfaceGuard', {
    interfaceName,
    methodGuards: stringMethodGuards,
    ...(symbolMethodGuardsEntries.length
      ? { symbolMethodGuards: makeCopyMap(symbolMethodGuardsEntries) }
      : {}),
    defaultGuards,
  });
  assertInterfaceGuard(result);
  return /** @type {InterfaceGuard<M>} */ (result);
};

const GuardPayloadShapes = harden({
  'guard:awaitArgGuard': AwaitArgGuardPayloadShape,
  'guard:rawGuard': RawGuardPayloadShape,
  'guard:methodGuard': MethodGuardPayloadShape,
  'guard:interfaceGuard': InterfaceGuardPayloadShape,
});
