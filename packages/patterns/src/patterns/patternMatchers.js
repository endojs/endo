// @ts-nocheck So many errors that the suppressions hamper readability.
// TODO parameterize MatchHelper which will solve most of them
import {
  q,
  b,
  X,
  Fail,
  makeError,
  annotateError,
  hideAndHardenFunction,
} from '@endo/errors';
import { applyLabelingError } from '@endo/common/apply-labeling-error.js';
import { fromUniqueEntries } from '@endo/common/from-unique-entries.js';
import { listDifference } from '@endo/common/list-difference.js';
import {
  Far,
  getTag,
  makeTagged,
  passStyleOf,
  nameForPassableSymbol,
} from '@endo/pass-style';
import {
  compareRank,
  getPassStyleCover,
  intersectRankCovers,
  unionRankCovers,
  recordNames,
  recordValues,
  qp,
} from '@endo/marshal';

import { keyEQ, keyGT, keyGTE, keyLT, keyLTE } from '../keys/compareKeys.js';
import {
  assertKey,
  confirmKey,
  isKey,
  confirmScalarKey,
  confirmCopySet,
  confirmCopyMap,
  copyMapKeySet,
  confirmCopyBag,
  getCopyMapEntryArray,
  makeCopyMap,
  makeCopySet,
  makeCopyBag,
} from '../keys/checkKey.js';
import { generateCollectionPairEntries } from '../keys/keycollection-operators.js';

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {CopyArray, CopyRecord, CopyTagged, Passable} from '@endo/pass-style';
 * @import {CopySet, CopyBag, ArgGuard, AwaitArgGuard, ConfirmPattern, GetRankCover, InterfaceGuard, MatcherNamespace, MethodGuard, MethodGuardMaker, Pattern, RawGuard, SyncValueGuard, Kind, Limits, AllLimits, Key, DefaultGuardType} from '../types.js';
 * @import {MatchHelper, PatternKit} from './types.js';
 */

const { entries, values, hasOwn } = Object;
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
  byteLengthLimit: 100_000,
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
 * @param {any} payload
 * @param {any} mainPayloadShape
 * @param {string} prefix
 * @param {Rejector} reject
 */
const confirmIsWellFormedWithLimit = (
  payload,
  mainPayloadShape,
  prefix,
  reject,
) => {
  assert(Array.isArray(mainPayloadShape));
  if (!Array.isArray(payload)) {
    return reject && reject`${q(prefix)} payload must be an array: ${payload}`;
  }

  const mainLength = mainPayloadShape.length;
  if (!(payload.length === mainLength || payload.length === mainLength + 1)) {
    return reject && reject`${q(prefix)} payload unexpected size: ${payload}`;
  }
  const limits = payload[mainLength];
  payload = harden(payload.slice(0, mainLength));
  // eslint-disable-next-line no-use-before-define
  if (!confirmLabeledMatches(payload, mainPayloadShape, prefix, reject)) {
    return false;
  }
  if (limits === undefined) {
    return true;
  }
  return (
    (passStyleOf(limits) === 'copyRecord' ||
      (reject && reject`Limits must be a record: ${q(limits)}`)) &&
    entries(limits).every(
      ([key, value]) =>
        passStyleOf(value) === 'number' ||
        (reject &&
          reject`Value of limit ${q(key)} but be a number: ${q(value)}`),
    )
  );
};

/**
 * @param {unknown} specimen
 * @param {number} decimalDigitsLimit
 * @param {Rejector} reject
 */
const confirmDecimalDigitsLimit = (specimen, decimalDigitsLimit, reject) => {
  if (
    Math.floor(Math.log10(Math.abs(Number(specimen)))) + 1 <=
    decimalDigitsLimit
  ) {
    return true;
  }
  return (
    reject &&
    reject`bigint ${specimen} must not have more than ${decimalDigitsLimit} digits`
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
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmTagged = (tagged, tag, reject) => {
    const matchHelper = maybeMatchHelper(tag);
    if (matchHelper) {
      // Buried here is the important case, where we process
      // the various patternNodes
      return matchHelper.confirmIsWellFormed(tagged.payload, reject);
    } else {
      const payloadShape = maybePayloadShape(tag);
      if (payloadShape !== undefined) {
        // eslint-disable-next-line no-use-before-define
        return confirmNestedMatches(tagged.payload, payloadShape, tag, reject);
      }
    }
    switch (tag) {
      case 'copySet': {
        return confirmCopySet(tagged, reject);
      }
      case 'copyBag': {
        return confirmCopyBag(tagged, reject);
      }
      case 'copyMap': {
        return confirmCopyMap(tagged, reject);
      }
      default: {
        return (
          reject && reject`cannot check unrecognized tag ${q(tag)}: ${tagged}`
        );
      }
    }
  };

  /**
   * Returns only a recognized kind, and only if the specimen passes the
   * invariants associated with that recognition.
   * Otherwise, if `reject` is false, returns undefined. Else rejects.
   *
   * @param {any} specimen
   * @param {Rejector} reject
   * @returns {Kind | undefined}
   */
  const confirmKindOf = (specimen, reject) => {
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
    if (confirmTagged(specimen, tag, reject)) {
      tagMemo.set(specimen, tag);
      return tag;
    }
    reject && reject`cannot check unrecognized tag ${q(tag)}`;
    return undefined;
  };
  harden(confirmKindOf);

  /**
   * @param {any} specimen
   * @returns {Kind | undefined}
   */
  const kindOf = specimen => confirmKindOf(specimen, false);
  harden(kindOf);

  /**
   * Checks only recognized kinds, and only if the specimen
   * passes the invariants associated with that recognition.
   *
   * @param {any} specimen
   * @param {Kind} kind
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmKind = (specimen, kind, reject) => {
    // check null and undefined as Keys
    if (singletonKinds.has(kind)) {
      // eslint-disable-next-line no-use-before-define
      return confirmAsKeyPatt(specimen, singletonKinds.get(kind), reject);
    }

    const realKind = confirmKindOf(specimen, reject);
    if (kind === realKind) {
      return true;
    }
    // `kind` and `realKind` can be embedded without quotes
    // because they are drawn from the enumerated collection of known Kinds.
    return reject && reject`${b(realKind)} ${specimen} - Must be a ${b(kind)}`;
  };

  /**
   * Checks only recognized kinds, and only if the specimen
   * passes the invariants associated with that recognition.
   *
   * @param {any} specimen
   * @param {Kind} kind
   * @returns {boolean}
   */
  const isKind = (specimen, kind) => confirmKind(specimen, kind, false);

  /**
   * Checks if a pattern matches only `undefined`.
   *
   * @param {any} patt
   * @returns {boolean}
   */
  const isUndefinedPatt = patt =>
    patt === undefined ||
    (isKind(patt, 'match:kind') && patt.payload === 'undefined');

  /**
   * @param {any} specimen
   * @param {Key} keyAsPattern
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmAsKeyPatt = (specimen, keyAsPattern, reject) => {
    if (isKey(specimen) && keyEQ(specimen, keyAsPattern)) {
      return true;
    }
    return (
      // When the mismatch occurs against a key used as a pattern,
      // the pattern should still be redacted.
      reject && reject`${specimen} - Must be: ${keyAsPattern}`
    );
  };

  // /////////////////////// isPattern /////////////////////////////////////////

  /** @type {ConfirmPattern} */
  const confirmPattern = (patt, reject) => {
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
    const result = confirmPatternInternal(patt, reject);
    if (result) {
      patternMemo.add(patt);
    }
    return result;
  };

  /**
   * @param {Passable} patt - known not to be a key, and therefore known
   * not to be primitive.
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmPatternInternal = (patt, reject) => {
    // Purposely parallels chonfirmKey. TODO reuse more logic between them.
    // Most of the text of the switch below not dealing with matchers is
    // essentially identical.
    const checkIt = child => confirmPattern(child, reject);

    const kind = confirmKindOf(patt, reject);
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
        return confirmPattern(patt.values, reject);
      }
      case 'error':
      case 'promise': {
        return reject && reject`A ${q(kind)} cannot be a pattern`;
      }
      default: {
        if (maybeMatchHelper(kind) !== undefined) {
          return true;
        }
        return (
          reject &&
          reject`A passable of kind ${q(kind)} is not a pattern: ${patt}`
        );
      }
    }
  };

  /**
   * @param {Passable} patt
   * @returns {boolean}
   */
  const isPattern = patt => confirmPattern(patt, false);

  /**
   * @param {Pattern} patt
   */
  const assertPattern = patt => {
    confirmPattern(patt, Fail);
  };

  // /////////////////////// matches ///////////////////////////////////////////

  /**
   * @param {any} specimen
   * @param {Pattern} pattern
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmMatches = (specimen, pattern, reject) =>
    // eslint-disable-next-line no-use-before-define
    confirmMatchesInternal(specimen, pattern, reject);
  hideAndHardenFunction(confirmMatches);

  /**
   * @param {any} specimen
   * @param {Pattern} patt
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmMatchesInternal = (specimen, patt, reject) => {
    // If `patt` does not have a kind (or is not a pattern)
    // then, even if `reject === false`, we should throw about
    // `patt` anyway.
    const patternKind = confirmKindOf(patt, Fail);
    const specimenKind = kindOf(specimen); // may be undefined
    switch (patternKind) {
      case undefined: {
        return reject && reject`pattern expected: ${patt}`;
      }
      case 'promise': {
        return reject && reject`promises cannot be patterns: ${patt}`;
      }
      case 'error': {
        return reject && reject`errors cannot be patterns: ${patt}`;
      }
      case 'undefined':
      case 'null':
      case 'boolean':
      case 'number':
      case 'bigint':
      case 'string':
      case 'symbol':
      case 'byteArray':
      case 'copySet':
      case 'copyBag':
      case 'remotable': {
        // These kinds are necessarily keys
        return confirmAsKeyPatt(specimen, patt, reject);
      }
      case 'copyArray': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return confirmAsKeyPatt(specimen, patt, reject);
        }
        if (specimenKind !== 'copyArray') {
          return (
            reject &&
            reject`${specimen} - Must be a copyArray to match a copyArray pattern: ${qp(
              patt,
            )}`
          );
        }
        const { length } = patt;
        if (specimen.length !== length) {
          return (
            reject &&
            reject`Array ${specimen} - Must be as long as copyArray pattern: ${qp(
              patt,
            )}`
          );
        }
        return patt.every((p, i) =>
          // eslint-disable-next-line no-use-before-define
          confirmNestedMatches(specimen[i], p, i, reject),
        );
      }
      case 'copyRecord': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return confirmAsKeyPatt(specimen, patt, reject);
        }
        if (specimenKind !== 'copyRecord') {
          return (
            reject &&
            reject`${specimen} - Must be a copyRecord to match a copyRecord pattern: ${qp(
              patt,
            )}`
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
          return (
            reject &&
            reject`${specimen} - Must have missing properties ${q(missing)}`
          );
        }
        const unexpected = listDifference(specimenNames, pattNames);
        if (unexpected.length >= 1) {
          return (
            reject &&
            reject`${specimen} - Must not have unexpected properties: ${q(
              unexpected,
            )}`
          );
        }
        const specimenValues = recordValues(specimen, specimenNames);
        const pattValues = recordValues(patt, pattNames);
        return pattNames.every((label, i) =>
          // eslint-disable-next-line no-use-before-define
          confirmNestedMatches(specimenValues[i], pattValues[i], label, reject),
        );
      }
      case 'copyMap': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return confirmAsKeyPatt(specimen, patt, reject);
        }
        if (specimenKind !== 'copyMap') {
          return (
            reject &&
            reject`${specimen} - Must be a copyMap to match a copyMap pattern: ${qp(
              patt,
            )}`
          );
        }
        // Compare keys as copySets
        const pattKeySet = copyMapKeySet(patt);
        const specimenKeySet = copyMapKeySet(specimen);
        if (!confirmMatches(specimenKeySet, pattKeySet, reject)) {
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
        return confirmMatches(
          harden(specimenValues),
          harden(pattValues),
          reject,
        );
      }
      default: {
        const matchHelper = maybeMatchHelper(patternKind);
        if (matchHelper) {
          return matchHelper.confirmMatches(specimen, patt.payload, reject);
        }
        throw Fail`internal: should have recognized ${q(patternKind)} `;
      }
    }
  };

  /**
   * @param {any} specimen
   * @param {Pattern} pattern
   * @param {string} prefix
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmNestedMatches = (specimen, pattern, prefix, reject) =>
    applyLabelingError(confirmMatches, [specimen, pattern, reject], prefix);

  /**
   * @param {any} specimen
   * @param {Pattern} patt
   * @returns {boolean}
   */
  const matches = (specimen, patt) => confirmMatches(specimen, patt, false);

  /**
   * Returning normally indicates success. Match failure is indicated by
   * throwing.
   *
   * @param {any} specimen
   * @param {Pattern} patt
   * @param {string|number|bigint} [label]
   */
  const mustMatch = (specimen, patt, label = undefined) => {
    let innerError;
    try {
      if (confirmMatches(specimen, patt, false)) {
        return;
      }
    } catch (er) {
      innerError = er;
    }
    // should only throw
    confirmNestedMatches(specimen, patt, label, Fail);
    const outerError = makeError(
      X`internal: ${label}: inconsistent pattern match: ${qp(patt)}`,
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
   * @param {string} labelPrefix
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmArrayEveryMatchPattern = (array, patt, labelPrefix, reject) => {
    if (isKind(patt, 'match:any')) {
      // if the pattern is M.any(), we know its true
      return true;
    }
    return array.every((el, i) =>
      confirmNestedMatches(el, patt, `${labelPrefix}[${i}]`, reject),
    );
  };

  // /////////////////////// Match Helpers /////////////////////////////////////

  /** @type {MatchHelper} */
  const matchAnyHelper = Far('match:any helper', {
    confirmMatches: (_specimen, _matcherPayload, _reject) => true,

    confirmIsWellFormed: (matcherPayload, reject) =>
      matcherPayload === undefined ||
      (reject &&
        reject`match:any payload: ${matcherPayload} - Must be undefined`),

    getRankCover: (_matchPayload, _encodePassable) => ['', '{'],
  });

  /** @type {MatchHelper} */
  const matchAndHelper = Far('match:and helper', {
    confirmMatches: (specimen, patts, reject) => {
      return patts.every(patt => confirmMatches(specimen, patt, reject));
    },

    confirmIsWellFormed: (allegedPatts, reject) => {
      const checkIt = patt => confirmPattern(patt, reject);
      return (
        (passStyleOf(allegedPatts) === 'copyArray' ||
          (reject &&
            reject`Needs array of sub-patterns: ${qp(allegedPatts)}`)) &&
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
    confirmMatches: (specimen, patts, reject) => {
      const { length } = patts;
      if (length === 0) {
        return (
          reject &&
          reject`${specimen} - no pattern disjuncts to match: ${qp(patts)}`
        );
      }
      // Special case disjunctions representing a single optional pattern for
      // better error messages.
      const binaryUndefPattIdx =
        patts.length === 2
          ? patts.findIndex(patt => isUndefinedPatt(patt))
          : -1;
      if (binaryUndefPattIdx !== -1) {
        return (
          specimen === undefined ||
          confirmMatches(specimen, patts[1 - binaryUndefPattIdx], reject)
        );
      }
      if (patts.some(patt => matches(specimen, patt))) {
        return true;
      }
      return reject && reject`${specimen} - Must match one of ${qp(patts)}`;
    },

    confirmIsWellFormed: matchAndHelper.confirmIsWellFormed,

    getRankCover: (patts, encodePassable) =>
      unionRankCovers(
        compareRank,
        patts.map(p => getRankCover(p, encodePassable)),
      ),
  });

  /** @type {MatchHelper} */
  const matchNotHelper = Far('match:not helper', {
    confirmMatches: (specimen, patt, reject) => {
      if (matches(specimen, patt)) {
        return (
          reject && reject`${specimen} - Must fail negated pattern: ${qp(patt)}`
        );
      } else {
        return true;
      }
    },

    confirmIsWellFormed: confirmPattern,

    getRankCover: (_patt, _encodePassable) => ['', '{'],
  });

  /** @type {MatchHelper} */
  const matchScalarHelper = Far('match:scalar helper', {
    confirmMatches: (specimen, _matcherPayload, reject) =>
      confirmScalarKey(specimen, reject),

    confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchKeyHelper = Far('match:key helper', {
    confirmMatches: (specimen, _matcherPayload, reject) =>
      confirmKey(specimen, reject),

    confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchPatternHelper = Far('match:pattern helper', {
    confirmMatches: (specimen, _matcherPayload, reject) =>
      confirmPattern(specimen, reject),

    confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchKindHelper = Far('match:kind helper', {
    confirmMatches: confirmKind,

    confirmIsWellFormed: (allegedKeyKind, reject) =>
      typeof allegedKeyKind === 'string' ||
      (reject &&
        reject`match:kind: payload: ${allegedKeyKind} - A kind name must be a string`),

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
  const matchTaggedHelper = Far('match:tagged helper', {
    confirmMatches: (specimen, [tagPatt, payloadPatt], reject) => {
      if (passStyleOf(specimen) !== 'tagged') {
        return (
          reject &&
          reject`Expected tagged object, not ${q(
            passStyleOf(specimen),
          )}: ${specimen}`
        );
      }
      return (
        confirmNestedMatches(getTag(specimen), tagPatt, 'tag', reject) &&
        confirmNestedMatches(specimen.payload, payloadPatt, 'payload', reject)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmNestedMatches(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        'match:tagged payload',
        reject,
      ),

    getRankCover: (_kind, _encodePassable) => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchBigintHelper = Far('match:bigint helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { decimalDigitsLimit } = limit(limits);
      return (
        confirmKind(specimen, 'bigint', reject) &&
        confirmDecimalDigitsLimit(specimen, decimalDigitsLimit, reject)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:bigint payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('bigint'),
  });

  /** @type {MatchHelper} */
  const matchNatHelper = Far('match:nat helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { decimalDigitsLimit } = limit(limits);
      const typedSpecimen = /** @type {bigint} */ (specimen);
      return (
        confirmKind(specimen, 'bigint', reject) &&
        (typedSpecimen >= 0n ||
          (reject && reject`${typedSpecimen} - Must be non-negative`)) &&
        confirmDecimalDigitsLimit(typedSpecimen, decimalDigitsLimit, reject)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:nat payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      // TODO Could be more precise
      getPassStyleCover('bigint'),
  });

  /** @type {MatchHelper} */
  const matchStringHelper = Far('match:string helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { stringLengthLimit } = limit(limits);
      const typedSpecimen = /** @type {string} */ (specimen);
      return (
        confirmKind(specimen, 'string', reject) &&
        (typedSpecimen.length <= stringLengthLimit ||
          (reject &&
            reject`string ${typedSpecimen} must not be bigger than ${stringLengthLimit}`))
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:string payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('string'),
  });

  /** @type {MatchHelper} */
  const matchSymbolHelper = Far('match:symbol helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { symbolNameLengthLimit } = limit(limits);
      if (!confirmKind(specimen, 'symbol', reject)) {
        return false;
      }
      const symbolName = nameForPassableSymbol(specimen);

      if (typeof symbolName !== 'string') {
        throw Fail`internal: Passable symbol ${specimen} must have a passable name`;
      }
      return (
        symbolName.length <= symbolNameLengthLimit ||
        (reject &&
          reject`Symbol name ${q(
            symbolName,
          )} must not be bigger than ${symbolNameLengthLimit}`)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:symbol payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('symbol'),
  });

  /** @type {MatchHelper} */
  const matchRemotableHelper = Far('match:remotable helper', {
    confirmMatches: (specimen, remotableDesc, reject) => {
      if (isKind(specimen, 'remotable')) {
        return true;
      }
      if (!reject) {
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
      return (
        reject &&
        reject`${specimen} - Must be a remotable ${b(label)}, not ${kindDetails}`
      );
    },

    confirmIsWellFormed: (allegedRemotableDesc, reject) =>
      confirmNestedMatches(
        allegedRemotableDesc,
        harden({ label: MM.string() }),
        'match:remotable payload',
        reject,
      ),

    getRankCover: (_remotableDesc, _encodePassable) =>
      getPassStyleCover('remotable'),
  });

  /** @type {MatchHelper} */
  const matchLTEHelper = Far('match:lte helper', {
    confirmMatches: (specimen, rightOperand, reject) =>
      keyLTE(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be <= ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

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
    confirmMatches: (specimen, rightOperand, reject) =>
      keyLT(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be < ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

    getRankCover: matchLTEHelper.getRankCover,
  });

  /** @type {MatchHelper} */
  const matchGTEHelper = Far('match:gte helper', {
    confirmMatches: (specimen, rightOperand, reject) =>
      keyGTE(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be >= ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

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
    confirmMatches: (specimen, rightOperand, reject) =>
      keyGT(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be > ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

    getRankCover: matchGTEHelper.getRankCover,
  });

  /** @type {MatchHelper} */
  const matchRecordOfHelper = Far('match:recordOf helper', {
    confirmMatches: (
      specimen,
      [keyPatt, valuePatt, limits = undefined],
      reject,
    ) => {
      const { numPropertiesLimit, propertyNameLengthLimit } = limit(limits);
      return (
        confirmKind(specimen, 'copyRecord', reject) &&
        (ownKeys(specimen).length <= numPropertiesLimit ||
          (reject &&
            reject`Must not have more than ${q(
              numPropertiesLimit,
            )} properties: ${specimen}`)) &&
        entries(specimen).every(
          ([key, value]) =>
            (key.length <= propertyNameLengthLimit ||
              (reject &&
                applyLabelingError(
                  () =>
                    reject`Property name must not be longer than ${q(
                      propertyNameLengthLimit,
                    )}`,
                  [],
                  key,
                ))) &&
            confirmNestedMatches(
              harden([key, value]),
              harden([keyPatt, valuePatt]),
              key,
              reject,
            ),
        )
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        'match:recordOf payload',
        reject,
      ),

    getRankCover: _entryPatt => getPassStyleCover('copyRecord'),
  });

  /** @type {MatchHelper} */
  const matchArrayOfHelper = Far('match:arrayOf helper', {
    confirmMatches: (specimen, [subPatt, limits = undefined], reject) => {
      const { arrayLengthLimit } = limit(limits);
      // prettier-ignore
      return (
        confirmKind(specimen, 'copyArray', reject) &&
        (/** @type {Array} */ (specimen).length <= arrayLengthLimit ||
          reject && reject`Array length ${specimen.length} must be <= limit ${arrayLengthLimit}`) &&
        confirmArrayEveryMatchPattern(specimen, subPatt, '', reject)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern()]),
        'match:arrayOf payload',
        reject,
      ),

    getRankCover: () => getPassStyleCover('copyArray'),
  });

  /** @type {MatchHelper} */
  const matchByteArrayHelper = Far('match:byteArray helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { byteLengthLimit } = limit(limits);
      // prettier-ignore
      return (
        confirmKind(specimen, 'byteArray', reject) &&
        (/** @type {ArrayBuffer} */ (specimen).byteLength <= byteLengthLimit ||
          reject && reject`byteArray ${specimen} must not be bigger than ${byteLengthLimit}`)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:byteArray payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('byteArray'),
  });

  /** @type {MatchHelper} */
  const matchSetOfHelper = Far('match:setOf helper', {
    confirmMatches: (specimen, [keyPatt, limits = undefined], reject) => {
      const { numSetElementsLimit } = limit(limits);
      return (
        ((confirmKind(specimen, 'copySet', reject) &&
          /** @type {Array} */ (specimen.payload).length <
            numSetElementsLimit) ||
          (reject &&
            reject`Set must not have more than ${q(numSetElementsLimit)} elements: ${
              specimen.payload.length
            }`)) &&
        confirmArrayEveryMatchPattern(
          specimen.payload,
          keyPatt,
          'set elements',
          reject,
        )
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern()]),
        'match:setOf payload',
        reject,
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchBagOfHelper = Far('match:bagOf helper', {
    confirmMatches: (
      specimen,
      [keyPatt, countPatt, limits = undefined],
      reject,
    ) => {
      const { numUniqueBagElementsLimit, decimalDigitsLimit } = limit(limits);
      return (
        ((confirmKind(specimen, 'copyBag', reject) &&
          /** @type {Array} */ (specimen.payload).length <=
            numUniqueBagElementsLimit) ||
          (reject &&
            reject`Bag must not have more than ${q(
              numUniqueBagElementsLimit,
            )} unique elements: ${specimen}`)) &&
        specimen.payload.every(
          ([key, count], i) =>
            confirmNestedMatches(key, keyPatt, `bag keys[${i}]`, reject) &&
            applyLabelingError(
              () =>
                confirmDecimalDigitsLimit(count, decimalDigitsLimit, reject) &&
                confirmMatches(count, countPatt, reject),
              [],
              `bag counts[${i}]`,
            ),
        )
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        'match:bagOf payload',
        reject,
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /**
   * @param {CopyArray} elements
   * @param {Pattern} elementPatt
   * @param {bigint} bound Must be >= 1n
   * @param {Rejector} reject
   * @param {CopyArray} [inResults]
   * @param {CopyArray} [outResults]
   * @returns {boolean}
   */
  const confirmElementsHasSplit = (
    elements,
    elementPatt,
    bound,
    reject,
    inResults = undefined,
    outResults = undefined,
  ) => {
    let count = 0n;
    // Since this feature is motivated by ERTP's use on
    // non-fungible (`set`, `copySet`) amounts,
    // their arrays store their elements in decending lexicographic order.
    // But this function has to make some choice amoung equally good minimal
    // results. It is more intuitive for the choice to be the first `bound`
    // matching elements in ascending lexicigraphic order, rather than
    // decending. Thus we iterate `elements` in reverse order.
    for (let i = elements.length - 1; i >= 0; i -= 1) {
      const element = elements[i];
      if (count < bound) {
        if (matches(element, elementPatt)) {
          count += 1n;
          if (inResults) inResults.push(element);
        } else if (outResults) {
          outResults.push(element);
        }
      } else if (outResults === undefined) {
        break;
      } else {
        outResults.push(element);
      }
    }
    return (
      count >= bound ||
      (reject && reject`Has only ${q(count)} matches, but needs ${q(bound)}`)
    );
  };

  /**
   * @param {CopyArray<[Key, bigint]>} pairs
   * @param {Pattern} elementPatt
   * @param {bigint} bound Must be >= 1n
   * @param {Rejector} reject
   * @param {CopyArray<[Key, bigint]>} [inResults]
   * @param {CopyArray<[Key, bigint]>} [outResults]
   * @returns {boolean}
   */
  const pairsHasSplit = (
    pairs,
    elementPatt,
    bound,
    reject,
    inResults = undefined,
    outResults = undefined,
  ) => {
    let count = 0n;
    // Since this feature is motivated by ERTP's use on
    // semi-fungible (`copyBag`) amounts,
    // their arrays store their elements in decending lexicographic order.
    // But this function has to make some choice amoung equally good minimal
    // results. It is more intuitive for the choice to be the first `bound`
    // matching elements in ascending lexicigraphic order, rather than
    // decending. Thus we iterate `pairs` in reverse order.
    for (let i = pairs.length - 1; i >= 0; i -= 1) {
      const [element, num] = pairs[i];
      const numRest = bound - count;
      if (numRest >= 1n) {
        if (matches(element, elementPatt)) {
          if (num <= numRest) {
            count += num;
            if (inResults) inResults.push([element, num]);
          } else {
            const numIn = numRest;
            count += numIn;
            if (inResults) inResults.push([element, numRest]);
            if (outResults) outResults.push([element, num - numRest]);
          }
        } else if (outResults) {
          outResults.push([element, num]);
        }
      } else if (outResults === undefined) {
        break;
      } else {
        outResults.push([element, num]);
      }
    }
    return (
      count >= bound ||
      (reject && reject`Has only ${q(count)} matches, but needs ${q(bound)}`)
    );
  };

  /**
   * @typedef {CopyArray | CopySet | CopyBag} Container
   * @param {Container} specimen
   * @param {Pattern} elementPatt
   * @param {bigint} bound Must be >= 1n
   * @param {Rejector} reject
   * @param {boolean} [needInResults]
   * @param {boolean} [needOutResults]
   * @returns {[Container | undefined, Container | undefined] | false}
   */
  const confirmContainerHasSplit = (
    specimen,
    elementPatt,
    bound,
    reject,
    needInResults = false,
    needOutResults = false,
  ) => {
    const inResults = needInResults ? [] : undefined;
    const outResults = needOutResults ? [] : undefined;
    const kind = kindOf(specimen);
    switch (kind) {
      case 'copyArray': {
        if (
          !confirmElementsHasSplit(
            specimen,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
          )
        ) {
          // check logic already performed by confirmContainerHasSplit
          return false;
        }
        return [inResults, outResults];
      }
      case 'copySet': {
        if (
          !confirmElementsHasSplit(
            specimen.payload,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
          )
        ) {
          return false;
        }
        return [
          inResults && makeCopySet(inResults),
          outResults && makeCopySet(outResults),
        ];
      }
      case 'copyBag': {
        if (
          !pairsHasSplit(
            specimen.payload,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
          )
        ) {
          return false;
        }
        return [
          inResults && makeCopyBag(inResults),
          outResults && makeCopyBag(outResults),
        ];
      }
      default: {
        return reject && reject`unexpected ${q(kind)}`;
      }
    }
  };

  /** @type {MatchHelper} */
  const matchContainerHasHelper = Far('M.containerHas helper', {
    /**
     * @param {CopyArray | CopySet | CopyBag} specimen
     * @param {[Pattern, bigint, Limits?]} payload
     * @param {Rejector} reject
     */
    confirmMatches: (
      specimen,
      [elementPatt, bound, limits = undefined],
      reject,
    ) => {
      const kind = confirmKindOf(specimen, reject);
      const { decimalDigitsLimit } = limit(limits);
      if (
        !applyLabelingError(
          confirmDecimalDigitsLimit,
          [bound, decimalDigitsLimit, reject],
          `${kind} matches`,
        )
      ) {
        return false;
      }
      return !!confirmContainerHasSplit(
        specimen,
        elementPatt,
        bound,
        reject,
        false,
        false,
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.gte(1n)]),
        'M.containerHas payload',
        reject,
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchMapOfHelper = Far('match:mapOf helper', {
    confirmMatches: (
      specimen,
      [keyPatt, valuePatt, limits = undefined],
      reject,
    ) => {
      const { numMapEntriesLimit } = limit(limits);
      return (
        confirmKind(specimen, 'copyMap', reject) &&
        // eslint-disable-next-line @endo/restrict-comparison-operands
        (specimen.payload.keys.length <= numMapEntriesLimit ||
          (reject &&
            reject`CopyMap must have no more than ${q(
              numMapEntriesLimit,
            )} entries: ${specimen}`)) &&
        confirmArrayEveryMatchPattern(
          specimen.payload.keys,
          keyPatt,
          'map keys',
          reject,
        ) &&
        confirmArrayEveryMatchPattern(
          specimen.payload.values,
          valuePatt,
          'map values',
          reject,
        )
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        'match:mapOf payload',
        reject,
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
    confirmMatches: (
      specimen,
      [requiredPatt, optionalPatt = [], restPatt = MM.any()],
      reject,
    ) => {
      if (!confirmKind(specimen, 'copyArray', reject)) {
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
          (reject &&
            reject`Expected at least ${q(
              requiredPatt.length,
            )} arguments: ${specimen}`)) &&
        requiredPatt.every((p, i) =>
          confirmNestedMatches(
            requiredSpecimen[i],
            p,
            // eslint-disable-next-line no-plusplus
            `arg ${argNum++}`,
            reject,
          ),
        ) &&
        partialPatt.every((p, i) =>
          confirmNestedMatches(
            optionalSpecimen[i],
            p,
            // eslint-disable-next-line no-plusplus
            `arg ${argNum++}?`,
            reject,
          ),
        ) &&
        confirmNestedMatches(restSpecimen, restPatt, '...rest', reject)
      );
    },

    /**
     * @param {Array} splitArray
     * @param {Rejector} reject
     */
    confirmIsWellFormed: (splitArray, reject) => {
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
      return (
        reject &&
        reject`Must be an array of a requiredPatt array, an optional optionalPatt array, and an optional restPatt: ${q(
          splitArray,
        )}`
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
      if (hasOwn(requiredPatt, name)) {
        requiredEntries.push([name, value]);
      } else if (hasOwn(optionalPatt, name)) {
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
    confirmMatches: (
      specimen,
      [requiredPatt, optionalPatt = {}, restPatt = MM.any()],
      reject,
    ) => {
      if (!confirmKind(specimen, 'copyRecord', reject)) {
        return false;
      }
      const { requiredSpecimen, optionalSpecimen, restSpecimen } =
        splitRecordParts(specimen, requiredPatt, optionalPatt);

      const partialNames = /** @type {string[]} */ (ownKeys(optionalSpecimen));
      const partialPatt = adaptRecordPattern(optionalPatt, partialNames);
      return (
        confirmMatches(requiredSpecimen, requiredPatt, reject) &&
        partialNames.every(name =>
          confirmNestedMatches(
            optionalSpecimen[name],
            partialPatt[name],
            `${name}?`,
            reject,
          ),
        ) &&
        confirmNestedMatches(restSpecimen, restPatt, '...rest', reject)
      );
    },

    /**
     * @param {Array} splitArray
     * @param {Rejector} reject
     */
    confirmIsWellFormed: (splitArray, reject) => {
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
      return (
        reject &&
        reject`Must be an array of a requiredPatt record, an optional optionalPatt record, and an optional restPatt: ${q(
          splitArray,
        )}`
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
    'match:tagged': matchTaggedHelper,
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
    'match:byteArray': matchByteArrayHelper,
    'match:recordOf': matchRecordOfHelper,
    'match:setOf': matchSetOfHelper,
    'match:bagOf': matchBagOfHelper,
    'match:containerHas': matchContainerHasHelper,
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
  const ByteArrayShape = makeTagged('match:byteArray', []);
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
    tagged: (tagPatt = M.string(), payloadPatt = M.any()) =>
      makeMatcher('match:tagged', harden([tagPatt, payloadPatt])),
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
    byteArray: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:byteArray', [limits]) : ByteArrayShape,
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
    containerHas: (elementPatt = M.any(), countPatt = 1n, limits = undefined) =>
      makeLimitsMatcher('match:containerHas', [elementPatt, countPatt, limits]),
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
    raw: () =>
      // eslint-disable-next-line no-use-before-define
      makeRawGuard(),
  });

  return harden({
    confirmMatches,
    confirmLabeledMatches: confirmNestedMatches,
    matches,
    mustMatch,
    assertPattern,
    isPattern,
    getRankCover,
    M,
    kindOf,
    containerHasSplit: confirmContainerHasSplit,
  });
};

// Only include those whose meaning is independent of an imputed sort order
// of remotables, or of encoding of passable as sortable strings. Thus,
// getRankCover is omitted. To get one, you'd need to instantiate
// `makePatternKit()` yourself. Since there are currently no external
// uses of `getRankCover`, for clarity during development, `makePatternKit`
// is not currently exported.
export const {
  confirmMatches,
  confirmLabeledMatches,
  matches,
  mustMatch,
  assertPattern,
  isPattern,
  getRankCover,
  M,
  kindOf,
  containerHasSplit,
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
hideAndHardenFunction(isAwaitArgGuard);

/**
 * @param {any} specimen
 * @returns {asserts specimen is AwaitArgGuard}
 */
export const assertAwaitArgGuard = specimen => {
  mustMatch(specimen, AwaitArgGuardShape, 'awaitArgGuard');
};
hideAndHardenFunction(assertAwaitArgGuard);

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
hideAndHardenFunction(assertMethodGuard);

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
hideAndHardenFunction(assertInterfaceGuard);

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
