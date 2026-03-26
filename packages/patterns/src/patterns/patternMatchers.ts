/* eslint-disable no-use-before-define */
import harden from '@endo/harden';
import type { Rejector } from '@endo/errors/rejector.js';
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
import type {
  CopyArray,
  CopyRecord,
  CopyTagged,
  PassStyle,
  Passable,
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
import type {
  AllLimits,
  ArgGuard,
  AwaitArgGuard,
  ConfirmPattern,
  CopyBag,
  CopyMap,
  CopySet,
  DefaultGuardType,
  GetRankCover,
  InterfaceGuard,
  Key,
  KeyToDBKey,
  Kind,
  Limits,
  Matcher,
  MatcherNamespace,
  MethodGuard,
  MethodGuardMaker,
  Pattern,
  RawGuard,
  SyncValueGuard,
} from '../types.js';
import type { MatchHelper, PatternKit } from './types.js';

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

const { entries, values, hasOwn } = Object;
const { ownKeys } = Reflect;

const patternMemo = new WeakSet<Pattern & object>();

type Container = CopyArray | CopySet | CopyBag;

// /////////////////////// Match Helpers Helpers /////////////////////////////

/** For forward references to `M` */
let MM: MatcherNamespace;

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
 */
const limit = (limits: Limits = {}): AllLimits =>
  harden({ __proto__: defaultLimits, ...limits }) as AllLimits;

const confirmIsWellFormedWithLimit = (
  payload: any,
  mainPayloadShape: any,
  prefix: string,
  reject: Rejector,
): boolean => {
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

const confirmDecimalDigitsLimit = (
  specimen: unknown,
  decimalDigitsLimit: number,
  reject: Rejector,
): boolean => {
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

const makePatternKit = (): PatternKit => {
  /**
   * If this is a recognized match tag, return the MatchHelper.
   * Otherwise return undefined.
   *
   */
  const maybeMatchHelper = (tag: string): MatchHelper<any> | undefined =>
    // eslint-disable-next-line no-use-before-define
    HelpersByMatchTag[tag];

  /**
   * Note that this function indicates absence by returning `undefined`,
   * even though `undefined` is a valid pattern. To evade this confusion,
   * to register a payload shape with that meaning, use `MM.undefined()`.
   *
   */
  const maybePayloadShape = (tag: string): Pattern | undefined =>
    // eslint-disable-next-line no-use-before-define
    GuardPayloadShapes[tag];

  const singletonKinds = new Map<Kind, unknown>([
    ['null', null],
    ['undefined', undefined],
  ]);

  /**
   * Only for tagged records of recognized kinds whose store-level invariants
   * have already been checked.
   */
  const tagMemo = new WeakMap<CopyTagged, Kind>();

  /**
   * Checks only recognized tags, and only if the tagged
   * passes the invariants associated with that recognition.
   */
  const confirmTagged = (
    tagged: CopyTagged<any, any>,
    tag: Kind,
    reject: Rejector,
  ): boolean => {
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
   */
  const confirmKindOf = (specimen: any, reject: Rejector): Kind | undefined => {
    const passStyle = passStyleOf(specimen);
    if (passStyle !== 'tagged') {
      return passStyle;
    }
    // At this point we know that specimen is well formed
    // as a tagged record, which is defined at the marshal level of abstraction,
    // since `passStyleOf` checks those invariants.
    if (tagMemo.has(specimen)) {
      return tagMemo.get(specimen) as Kind;
    }
    const tag = getTag(specimen) as Kind;
    if (confirmTagged(specimen, tag, reject)) {
      tagMemo.set(specimen, tag);
      return tag;
    }
    reject && reject`cannot check unrecognized tag ${q(tag)}`;
    return undefined;
  };
  harden(confirmKindOf);

  /**
   */
  const kindOf = (specimen: any): Kind | undefined =>
    confirmKindOf(specimen, false);
  harden(kindOf);

  /**
   * Checks only recognized kinds, and only if the specimen
   * passes the invariants associated with that recognition.
   *
   */
  const confirmKind = (
    specimen: any,
    kind: Kind,
    reject: Rejector,
  ): boolean => {
    // check null and undefined as Keys
    if (singletonKinds.has(kind)) {
      // eslint-disable-next-line no-use-before-define
      return confirmAsKeyPatt(
        specimen,
        singletonKinds.get(kind) as Key,
        reject,
      );
    }

    const realKind = confirmKindOf(specimen, reject);
    if (kind === realKind) {
      return true;
    }
    // `kind` and `realKind` can be embedded without quotes
    // because they are drawn from the enumerated collection of known Kinds.
    return (
      reject &&
      reject`${b(realKind ?? 'unknown')} ${specimen} - Must be a ${b(kind)}`
    );
  };

  /**
   * Checks only recognized kinds, and only if the specimen
   * passes the invariants associated with that recognition.
   *
   */
  const isKind = (specimen: any, kind: Kind): boolean =>
    confirmKind(specimen, kind, false);

  /**
   * Checks if a pattern matches only `undefined`.
   *
   */
  const isUndefinedPatt = (patt: any): boolean =>
    patt === undefined ||
    (isKind(patt, 'match:kind') && patt.payload === 'undefined');

  /**
   */
  const confirmAsKeyPatt = (
    specimen: any,
    keyAsPattern: Key,
    reject: Rejector,
  ): boolean => {
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

  const confirmPattern: ConfirmPattern = (patt, reject) => {
    if (isKey(patt)) {
      // All keys are patterns. For these, the keyMemo will do.
      // All primitives that are patterns are also keys, which this
      // also takes care of without memo. The rest of our checking logic
      // is only concerned with non-key patterns.
      return true;
    }
    if (patternMemo.has(patt as Pattern & object)) {
      return true;
    }
    // eslint-disable-next-line no-use-before-define
    const result = confirmPatternInternal(patt, reject);
    if (result) {
      patternMemo.add(patt as Pattern & object);
    }
    return result;
  };

  /**
   * not to be primitive.
   */
  const confirmPatternInternal = (
    patt: Passable,
    reject: Rejector,
  ): boolean => {
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
        return values(patt as CopyRecord<Passable>).every(checkIt);
      }
      case 'copyArray': {
        // A copyArray is a pattern iff all its children are
        // patterns
        return (patt as CopyArray<Passable>).every(checkIt);
      }
      case 'copyMap': {
        // A copyMap's keys are keys and therefore already known to be
        // patterns.
        // A copyMap is a pattern if its values are patterns.
        return confirmPattern(
          (patt as CopyTagged<string, { keys: any[]; values: any[] }>).payload
            .values,
          reject,
        );
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
   */
  const isPattern = (patt: Passable): boolean => confirmPattern(patt, false);

  /**
   */
  function assertPattern(patt: Pattern): void {
    confirmPattern(patt, Fail);
  }

  // /////////////////////// matches ///////////////////////////////////////////

  /**
   */
  const confirmMatches = (
    specimen: any,
    pattern: Pattern,
    reject: Rejector,
  ): boolean =>
    // eslint-disable-next-line no-use-before-define
    confirmMatchesInternal(specimen, pattern, reject);
  hideAndHardenFunction(confirmMatches);

  /**
   */
  const confirmMatchesInternal = (
    specimen: any,
    patt: Pattern,
    reject: Rejector,
  ): boolean => {
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
        return confirmAsKeyPatt(specimen, patt as Key, reject);
      }
      case 'copyArray': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return confirmAsKeyPatt(specimen, patt as Key, reject);
        }
        if (specimenKind !== 'copyArray') {
          return (
            reject &&
            reject`${specimen} - Must be a copyArray to match a copyArray pattern: ${qp(
              patt,
            )}`
          );
        }
        const pattArray = patt as CopyArray<Pattern>;
        const { length } = pattArray;
        if (specimen.length !== length) {
          return (
            reject &&
            reject`Array ${specimen} - Must be as long as copyArray pattern: ${qp(
              patt,
            )}`
          );
        }
        return pattArray.every((p, i) =>
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
        const pattRecord = patt as CopyRecord<Pattern>;
        // TODO Detect and accumulate difference in one pass.
        // Rather than using two calls to `listDifference` to detect and
        // report if and how these lists differ, since they are already
        // in sorted order, we should instead use an algorithm like
        // `iterDisjointUnion` from merge-sort-operators.js
        const specimenNames = recordNames(specimen);
        const pattNames = recordNames(pattRecord);
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
        const pattValues = recordValues(pattRecord, pattNames) as Pattern[];
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
        const pattMap = patt as CopyMap<Key, Pattern>;
        // Compare keys as copySets
        const pattKeySet = copyMapKeySet(pattMap) as Pattern;
        const specimenKeySet = copyMapKeySet(specimen);
        if (!confirmMatches(specimenKeySet, pattKeySet, reject)) {
          return false;
        }
        // Compare values as copyArrays after applying a shared total order.
        // This is necessary because the antiRankOrder sorting of each map's
        // entries is a preorder that admits ties.
        const pattValues: Passable[] = [];
        const specimenValues: Passable[] = [];
        const entryPairs = generateCollectionPairEntries(
          pattMap,
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
          return matchHelper.confirmMatches(
            specimen,
            (patt as CopyTagged<string, Passable>).payload,
            reject,
          );
        }
        throw Fail`internal: should have recognized ${q(patternKind)} `;
      }
    }
  };

  /**
   */
  const confirmNestedMatches = (
    specimen: any,
    pattern: Pattern,
    prefix: string | number | undefined,
    reject: Rejector,
  ): boolean =>
    applyLabelingError(confirmMatches, [specimen, pattern, reject], prefix);

  /**
   */
  const matches = (specimen: any, patt: Pattern): boolean =>
    confirmMatches(specimen, patt, false);

  /**
   * Returning normally indicates success. Match failure is indicated by
   * throwing.
   *
   */
  const mustMatch = (
    specimen: any,
    patt: Pattern,
    label: string | number | bigint | undefined = undefined,
  ): void => {
    let innerError;
    try {
      if (confirmMatches(specimen, patt, false)) {
        return;
      }
    } catch (er) {
      innerError = er;
    }
    // should only throw
    confirmNestedMatches(
      specimen,
      patt,
      typeof label === 'bigint' ? `${label}` : label,
      Fail,
    );
    const outerError = makeError(
      X`internal: ${label}: inconsistent pattern match: ${qp(patt)}`,
    );
    if (innerError !== undefined) {
      annotateError(outerError, X`caused by ${innerError}`);
    }
    throw outerError;
  };

  // /////////////////////// getRankCover //////////////////////////////////////

  const getRankCover: GetRankCover = (patt, encodePassable) => {
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
        const tag = getTag(patt as CopyTagged<string, Passable>);
        const matchHelper = maybeMatchHelper(tag);
        if (matchHelper) {
          // Buried here is the important case, where we process
          // the various patternNodes
          return matchHelper.getRankCover(
            (patt as CopyTagged<string, Passable>).payload,
            encodePassable,
          );
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
   */
  const confirmArrayEveryMatchPattern = (
    array: Passable[],
    patt: Pattern,
    labelPrefix: string,
    reject: Rejector,
  ): boolean => {
    if (isKind(patt, 'match:any')) {
      // if the pattern is M.any(), we know its true
      return true;
    }
    return array.every((el, i) =>
      confirmNestedMatches(el, patt, `${labelPrefix}[${i}]`, reject),
    );
  };

  // /////////////////////// Match Helpers /////////////////////////////////////

  const matchAnyHelper: MatchHelper<undefined> = Far('match:any helper', {
    confirmMatches: (_specimen, _matcherPayload, _reject) => true,

    confirmIsWellFormed: (matcherPayload, reject) =>
      matcherPayload === undefined ||
      (reject &&
        reject`match:any payload: ${matcherPayload} - Must be undefined`),

    getRankCover: (_matchPayload, _encodePassable) => ['', '{'],
  });

  const matchAndHelper: MatchHelper<CopyArray<Pattern>> = Far(
    'match:and helper',
    {
      confirmMatches: (specimen, patts, reject) => {
        return patts.every(patt => confirmMatches(specimen, patt, reject));
      },

      confirmIsWellFormed: (allegedPatts, reject) => {
        const checkIt = patt => confirmPattern(patt, reject);
        return (
          (passStyleOf(allegedPatts) === 'copyArray' ||
            (reject &&
              reject`Needs array of sub-patterns: ${qp(allegedPatts)}`)) &&
          (allegedPatts as CopyArray<Passable>).every(checkIt)
        );
      },

      getRankCover: (patts, encodePassable) =>
        intersectRankCovers(
          compareRank,
          (patts as CopyArray<Passable>).map(p =>
            getRankCover(p, encodePassable),
          ),
        ),
    },
  );

  const matchOrHelper: MatchHelper<CopyArray<Pattern>> = Far(
    'match:or helper',
    {
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
          (patts as CopyArray<Passable>).map(p =>
            getRankCover(p, encodePassable),
          ),
        ),
    },
  );

  const matchNotHelper: MatchHelper<Pattern> = Far('match:not helper', {
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

  const matchScalarHelper: MatchHelper<undefined> = Far('match:scalar helper', {
    confirmMatches: (specimen, _matcherPayload, reject) =>
      confirmScalarKey(specimen, reject),

    confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  const matchKeyHelper: MatchHelper<undefined> = Far('match:key helper', {
    confirmMatches: (specimen, _matcherPayload, reject) =>
      confirmKey(specimen, reject),

    confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  const matchPatternHelper: MatchHelper<undefined> = Far(
    'match:pattern helper',
    {
      confirmMatches: (specimen, _matcherPayload, reject) =>
        confirmPattern(specimen, reject),

      confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,

      getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
    },
  );

  const matchKindHelper: MatchHelper<string> = Far('match:kind helper', {
    confirmMatches: (specimen, kind, reject) =>
      confirmKind(specimen, kind as Kind, reject),

    confirmIsWellFormed: (allegedKeyKind, reject) =>
      typeof allegedKeyKind === 'string' ||
      (reject &&
        reject`match:kind: payload: ${allegedKeyKind} - A kind name must be a string`),

    getRankCover: (kind, _encodePassable) => {
      let style: PassStyle;
      switch (kind) {
        case 'copySet':
        case 'copyMap': {
          style = 'tagged';
          break;
        }
        default: {
          style = kind as PassStyle;
          break;
        }
      }
      return getPassStyleCover(style);
    },
  });

  const matchTaggedHelper: MatchHelper<[Pattern, Pattern]> = Far(
    'match:tagged helper',
    {
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
          confirmNestedMatches(
            getTag(specimen as CopyTagged<string, Passable>),
            tagPatt,
            'tag',
            reject,
          ) &&
          confirmNestedMatches(
            (specimen as CopyTagged<string, Passable>).payload,
            payloadPatt,
            'payload',
            reject,
          )
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
    },
  );

  const matchBigintHelper: MatchHelper<[Limits?]> = Far('match:bigint helper', {
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

  const matchNatHelper: MatchHelper<[Limits?]> = Far('match:nat helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { decimalDigitsLimit } = limit(limits);
      const typedSpecimen = specimen as bigint;
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

  const matchStringHelper: MatchHelper<[Limits?]> = Far('match:string helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { stringLengthLimit } = limit(limits);
      const typedSpecimen = specimen as string;
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

  const matchSymbolHelper: MatchHelper<[Limits?]> = Far('match:symbol helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { symbolNameLengthLimit } = limit(limits);
      if (!confirmKind(specimen, 'symbol', reject)) {
        return false;
      }
      const symbolName = nameForPassableSymbol(specimen as symbol);

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

  const matchRemotableHelper: MatchHelper<{ label: string }> = Far(
    'match:remotable helper',
    {
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
              q(getTag(specimen as CopyTagged<string, Passable>));
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
    },
  );

  const matchPromiseHelper: MatchHelper<{ label: string }> = Far(
    'match:promise helper',
    {
      confirmMatches: (specimen, promiseDesc, reject) => {
        if (isKind(specimen, 'promise')) {
          return true;
        }
        if (!reject) {
          return false;
        }
        const { label } = promiseDesc;
        const passStyle = passStyleOf(specimen);
        const kindDetails =
          passStyle !== 'tagged'
            ? b(passStyle)
            : q(getTag(specimen as CopyTagged<string, Passable>));
        return (
          reject &&
          reject`${specimen} - Must be a promise ${b(label)}, not ${kindDetails}`
        );
      },

      confirmIsWellFormed: (allegedPromiseDesc, reject) =>
        confirmNestedMatches(
          allegedPromiseDesc,
          harden({ label: MM.string() }),
          'match:promise payload',
          reject,
        ),

      getRankCover: (_promiseDesc, _encodePassable) =>
        getPassStyleCover('promise'),
    },
  );

  const matchLTEHelper: MatchHelper<Key> = Far('match:lte helper', {
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
      const newRightBound = `${encodePassable(rightOperand as Key)}~`;
      if (newRightBound !== undefined) {
        rightBound = newRightBound;
      }
      return [leftBound, rightBound];
    },
  });

  const matchLTHelper: MatchHelper<Key> = Far('match:lt helper', {
    confirmMatches: (specimen, rightOperand, reject) =>
      keyLT(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be < ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

    getRankCover: matchLTEHelper.getRankCover,
  });

  const matchGTEHelper: MatchHelper<Key> = Far('match:gte helper', {
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
      const newLeftBound = encodePassable(rightOperand as Key);
      if (newLeftBound !== undefined) {
        leftBound = newLeftBound;
      }
      return [leftBound, rightBound];
    },
  });

  const matchGTHelper: MatchHelper<Key> = Far('match:gt helper', {
    confirmMatches: (specimen, rightOperand, reject) =>
      keyGT(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be > ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

    getRankCover: matchGTEHelper.getRankCover,
  });

  const matchRecordOfHelper: MatchHelper<[Pattern, Pattern, Limits?]> = Far(
    'match:recordOf helper',
    {
      confirmMatches: (
        specimen,
        [keyPatt, valuePatt, limits = undefined],
        reject,
      ) => {
        const { numPropertiesLimit, propertyNameLengthLimit } = limit(limits);
        return (
          confirmKind(specimen, 'copyRecord', reject) &&
          (ownKeys(specimen as object).length <= numPropertiesLimit ||
            (reject &&
              reject`Must not have more than ${q(
                numPropertiesLimit,
              )} properties: ${specimen}`)) &&
          entries(specimen as object).every(
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
    },
  );

  const matchArrayOfHelper: MatchHelper<[Pattern, Limits?]> = Far(
    'match:arrayOf helper',
    {
      confirmMatches: (specimen, [subPatt, limits = undefined], reject) => {
        const { arrayLengthLimit } = limit(limits);
        // prettier-ignore
        return (
        confirmKind(specimen, 'copyArray', reject) &&
        ((specimen as Array<unknown>).length <= arrayLengthLimit ||
          reject && reject`Array length ${(specimen as Array<unknown>).length} must be <= limit ${arrayLengthLimit}`) &&
        confirmArrayEveryMatchPattern(specimen as Passable[], subPatt, '', reject)
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
    },
  );

  const matchByteArrayHelper: MatchHelper<[Limits?]> = Far(
    'match:byteArray helper',
    {
      confirmMatches: (specimen, [limits = undefined], reject) => {
        const { byteLengthLimit } = limit(limits);
        // prettier-ignore
        return (
        confirmKind(specimen, 'byteArray', reject) &&
        ((specimen as ArrayBuffer).byteLength <= byteLengthLimit ||
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
    },
  );

  const matchSetOfHelper: MatchHelper<[Pattern, Limits?]> = Far(
    'match:setOf helper',
    {
      confirmMatches: (specimen, [keyPatt, limits = undefined], reject) => {
        const { numSetElementsLimit } = limit(limits);
        const specimenSet = specimen as CopySet;
        return (
          ((confirmKind(specimen, 'copySet', reject) &&
            specimenSet.payload.length < numSetElementsLimit) ||
            (reject &&
              reject`Set must not have more than ${q(numSetElementsLimit)} elements: ${
                specimenSet.payload.length
              }`)) &&
          confirmArrayEveryMatchPattern(
            specimenSet.payload,
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
    },
  );

  const matchBagOfHelper: MatchHelper<[Pattern, Pattern, Limits?]> = Far(
    'match:bagOf helper',
    {
      confirmMatches: (
        specimen,
        [keyPatt, countPatt, limits = undefined],
        reject,
      ) => {
        const { numUniqueBagElementsLimit, decimalDigitsLimit } = limit(limits);
        const specimenBag = specimen as CopyBag;
        return (
          ((confirmKind(specimen, 'copyBag', reject) &&
            specimenBag.payload.length <= numUniqueBagElementsLimit) ||
            (reject &&
              reject`Bag must not have more than ${q(
                numUniqueBagElementsLimit,
              )} unique elements: ${specimen}`)) &&
          specimenBag.payload.every(
            ([key, count], i) =>
              confirmNestedMatches(key, keyPatt, `bag keys[${i}]`, reject) &&
              applyLabelingError(
                () =>
                  confirmDecimalDigitsLimit(
                    count,
                    decimalDigitsLimit,
                    reject,
                  ) && confirmMatches(count, countPatt, reject),
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
    },
  );

  /**
   * intuitive results with descending lexicographic CopySet/CopyBag payloads);
   * 1 for picking from the start (which gives intuitive results with other
   * arrays)
   */
  const confirmElementsHasSplit = <T extends Passable>(
    elements: CopyArray<T>,
    elementPatt: Pattern,
    bound: bigint,
    reject: Rejector,
    inResults: T[] | undefined,
    outResults: T[] | undefined,
    direction: -1 | 1,
  ): boolean => {
    let inCount = 0n;
    const firstIndex = direction === -1 ? elements.length - 1 : 0;
    const stopIndex = direction === -1 ? -1 : elements.length;
    for (let i = firstIndex; i !== stopIndex; i += direction) {
      const element = elements[i];
      if (inCount >= bound) {
        if (!outResults) break;
        outResults.push(element);
      } else if (matches(element, elementPatt)) {
        inCount += 1n;
        if (inResults) inResults.push(element);
      } else if (outResults) {
        outResults.push(element);
      }
    }
    return (
      inCount >= bound ||
      (reject && reject`Has only ${q(inCount)} matches, but needs ${q(bound)}`)
    );
  };

  /**
   */
  const pairsHasSplit = (
    pairs: CopyArray<[Key, bigint]>,
    elementPatt: Pattern,
    bound: bigint,
    reject: Rejector,
    inResults: [Key, bigint][] | undefined = undefined,
    outResults: [Key, bigint][] | undefined = undefined,
  ): boolean => {
    let inCount = 0n;
    // To produce intuitive results with CopyBag payloads (which are ordered by
    // descending lexicographic Key order), we iterate by reverse array index
    // and therefore consider elements in *ascending* lexicographic Key order.
    for (let i = pairs.length - 1; i >= 0; i -= 1) {
      const [element, num] = pairs[i];
      const stillNeeds = bound - inCount;
      if (stillNeeds <= 0n) {
        if (!outResults) break;
        outResults.push([element, num]);
      } else if (matches(element, elementPatt)) {
        const isPartial = num > stillNeeds;
        const numTake = isPartial ? stillNeeds : num;
        inCount += numTake;
        if (inResults) inResults.push([element, numTake]);
        if (isPartial && outResults) outResults.push([element, num - numTake]);
      } else if (outResults) {
        outResults.push([element, num]);
      }
    }
    return (
      inCount >= bound ||
      (reject && reject`Has only ${q(inCount)} matches, but needs ${q(bound)}`)
    );
  };

  /**
   * Confirms that `specimen` contains at least `bound` instances of an element
   * matched by `elementPatt`, optionally returning those bounded matches and/or
   * their complement as specified by `needInResults` and `needOutResults`
   * (considering CopyArray elements by ascending index and CopySet/CopyBag
   * elements in lexicographic order).
   * Note that CopyBag elements can be split; when only some of the count
   * associated with a single Key is necessary to bring cumulative matches up to
   * `bound`, the rest of that count is not considered to be matching.
   * If the specimen does not contain enough matching instances, this function
   * terminates as directed by `reject` (i.e., either returning `false` or
   * throwing an error).
   */
  const containerHasSplit = (
    specimen: Passable,
    elementPatt: Pattern,
    bound: bigint,
    reject: Rejector,
    needInResults = false,
    needOutResults = false,
  ):
    | [matches: Container | undefined, discards: Container | undefined]
    | false => {
    const kind = kindOf(specimen);
    switch (kind) {
      case 'copyArray': {
        const inResults = needInResults ? ([] as Passable[]) : undefined;
        const outResults = needOutResults ? ([] as Passable[]) : undefined;
        return (
          confirmElementsHasSplit(
            specimen as CopyArray<Passable>,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
            1,
          ) && harden([inResults, outResults])
        );
      }
      case 'copySet': {
        const specimenSet = specimen as CopySet;
        const inResults = needInResults ? ([] as Passable[]) : undefined;
        const outResults = needOutResults ? ([] as Passable[]) : undefined;
        return (
          confirmElementsHasSplit(
            specimenSet.payload,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
            -1,
          ) &&
          harden([
            inResults && makeCopySet(inResults as Key[]),
            outResults && makeCopySet(outResults as Key[]),
          ])
        );
      }
      case 'copyBag': {
        const specimenBag = specimen as CopyBag;
        const inResults = needInResults ? ([] as [Key, bigint][]) : undefined;
        const outResults = needOutResults ? ([] as [Key, bigint][]) : undefined;
        return (
          pairsHasSplit(
            specimenBag.payload,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
          ) &&
          harden([
            inResults && makeCopyBag(inResults),
            outResults && makeCopyBag(outResults),
          ])
        );
      }
      default: {
        return reject && reject`unexpected ${q(kind)}`;
      }
    }
  };

  const matchContainerHasHelper: MatchHelper<[Pattern, bigint, Limits?]> = Far(
    'M.containerHas helper',
    {
      confirmMatches: (
        specimen,
        [elementPatt, bound, limits = undefined],
        reject,
      ) => {
        confirmKindOf(specimen, reject);
        const { decimalDigitsLimit } = limit(limits);
        if (!confirmDecimalDigitsLimit(bound, decimalDigitsLimit, reject)) {
          return false;
        }
        return !!containerHasSplit(
          specimen as Container,
          elementPatt,
          bound,
          reject,
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
    },
  );

  const matchMapOfHelper: MatchHelper<[Pattern, Pattern, Limits?]> = Far(
    'match:mapOf helper',
    {
      confirmMatches: (
        specimen,
        [keyPatt, valuePatt, limits = undefined],
        reject,
      ) => {
        const { numMapEntriesLimit } = limit(limits);
        const specimenMap = specimen as CopyMap;
        return (
          confirmKind(specimen, 'copyMap', reject) &&
          // eslint-disable-next-line @endo/restrict-comparison-operands
          (specimenMap.payload.keys.length <= numMapEntriesLimit ||
            (reject &&
              reject`CopyMap must have no more than ${q(
                numMapEntriesLimit,
              )} entries: ${specimen}`)) &&
          confirmArrayEveryMatchPattern(
            specimenMap.payload.keys,
            keyPatt,
            'map keys',
            reject,
          ) &&
          confirmArrayEveryMatchPattern(
            specimenMap.payload.values,
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
    },
  );

  /** Split an array specimen into required, optional, and rest segments. */
  const splitArrayParts = (
    specimen: Passable[],
    requiredPatt: Pattern[],
    optionalPatt: Pattern[],
  ): {
    requiredSpecimen: Passable[];
    optionalSpecimen: Passable[];
    restSpecimen: Passable[];
  } => {
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
   * We encode this with `M.or` so it still compresses absence vs `undefined`.
   */
  const adaptArrayPattern = (
    optionalPatt: Pattern[],
    length: number,
  ): Pattern[] =>
    harden(optionalPatt.slice(0, length).map(patt => MM.opt(patt)));

  const matchSplitArrayHelper: MatchHelper<
    [Pattern[], (Pattern[] | undefined)?, (Pattern | undefined)?]
  > = Far('match:splitArray helper', {
    confirmMatches: (
      specimen,
      [requiredPatt, optionalPatt = [], restPatt = MM.any()],
      reject,
    ) => {
      if (!confirmKind(specimen, 'copyArray', reject)) {
        return false;
      }
      const { requiredSpecimen, optionalSpecimen, restSpecimen } =
        splitArrayParts(specimen as Passable[], requiredPatt, optionalPatt);
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

    confirmIsWellFormed: (splitArray, reject) => {
      if (passStyleOf(splitArray) === 'copyArray') {
        const typedSplitArray = splitArray as CopyArray<Passable>;
        if (!(typedSplitArray.length >= 1 && typedSplitArray.length <= 3)) {
          return (
            reject &&
            reject`Must be an array of a requiredPatt array, an optional optionalPatt array, and an optional restPatt: ${q(
              splitArray,
            )}`
          );
        }
        const [requiredPatt, optionalPatt = undefined, restPatt = undefined] =
          typedSplitArray;
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

  /** Split a record specimen into required, optional, and rest records. */
  const splitRecordParts = (
    specimen: CopyRecord<Passable>,
    requiredPatt: CopyRecord<Pattern>,
    optionalPatt: CopyRecord<Pattern>,
  ): {
    requiredSpecimen: CopyRecord<Passable>;
    optionalSpecimen: CopyRecord<Passable>;
    restSpecimen: CopyRecord<Passable>;
  } => {
    // Not frozen! Mutated in place
    const requiredEntries: [string, Passable][] = [];
    const optionalEntries: [string, Passable][] = [];
    const restEntries: [string, Passable][] = [];
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
   * We encode this with `M.or` so it still compresses absence vs `undefined`.
   */
  const adaptRecordPattern = (
    optionalPatt: CopyRecord<Pattern>,
    names: string[],
  ): CopyRecord<Pattern> =>
    fromUniqueEntries(names.map(name => [name, MM.opt(optionalPatt[name])]));

  const matchSplitRecordHelper: MatchHelper<
    [
      CopyRecord<Pattern>,
      (CopyRecord<Pattern> | undefined)?,
      (Pattern | undefined)?,
    ]
  > = Far('match:splitRecord helper', {
    confirmMatches: (
      specimen,
      [requiredPatt, optionalPatt = {}, restPatt = MM.any()],
      reject,
    ) => {
      if (!confirmKind(specimen, 'copyRecord', reject)) {
        return false;
      }
      const { requiredSpecimen, optionalSpecimen, restSpecimen } =
        splitRecordParts(
          specimen as CopyRecord<Passable>,
          requiredPatt,
          optionalPatt,
        );

      const partialNames = ownKeys(optionalSpecimen).filter(
        (name): name is string => typeof name === 'string',
      );
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

    confirmIsWellFormed: (splitArray, reject) => {
      if (passStyleOf(splitArray) === 'copyArray') {
        const typedSplitArray = splitArray as CopyArray<Passable>;
        if (!(typedSplitArray.length >= 1 && typedSplitArray.length <= 3)) {
          return (
            reject &&
            reject`Must be an array of a requiredPatt record, an optional optionalPatt record, and an optional restPatt: ${q(
              splitArray,
            )}`
          );
        }
        const [requiredPatt, optionalPatt = undefined, restPatt = undefined] =
          typedSplitArray;
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

  const HelpersByMatchTag: Record<string, MatchHelper<any>> = harden({
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
    'match:promise': matchPromiseHelper,

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

  const makeMatcher = <Tag extends `match:${string}`, Payload extends Passable>(
    tag: Tag,
    payload: Payload,
  ): CopyTagged<Tag, Payload> => {
    const matcher = makeTagged(tag, payload);
    assertPattern(matcher);
    return matcher;
  };

  const makeKindMatcher = <K extends string>(kind: K) =>
    makeMatcher('match:kind', kind);

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
   * Drop a trailing `undefined` limits argument from matcher payloads.
   */
  const makeLimitsMatcher = (
    tag: `match:${string}`,
    payload: Passable[],
  ): Matcher => {
    if (payload[payload.length - 1] === undefined) {
      payload = harden(payload.slice(0, payload.length - 1));
    }
    return makeMatcher(tag, payload);
  };

  const makeRemotableMatcher = (
    label: string | undefined = undefined,
  ): Matcher =>
    label === undefined
      ? RemotableShape
      : makeMatcher('match:remotable', harden({ label }));

  const makePromiseMatcher = (
    label: string | undefined = undefined,
  ): Matcher =>
    label === undefined
      ? PromiseShape
      : makeMatcher('match:promise', harden({ label }));

  const makeSplitPayload = <T>(
    empty: T,
    base: T,
    optional: T | undefined = undefined,
    rest: T | undefined = undefined,
  ): T[] => {
    if (rest) {
      return [base, optional || empty, rest];
    }
    if (optional) {
      return [base, optional];
    }
    return [base];
  };

  // //////////////////

  const rawM = harden({
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
    promise: makePromiseMatcher,
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
      if (Array.isArray(base)) {
        return M.splitArray(base, rest && [], rest);
      } else {
        return M.splitRecord(base, rest && {}, rest);
      }
    },
    partial: (base, rest = undefined) => {
      if (Array.isArray(base)) {
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
  const M = rawM as unknown as MatcherNamespace;

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
    containerHasSplit,
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

export const isAwaitArgGuard = (specimen: any): specimen is AwaitArgGuard =>
  matches(specimen, AwaitArgGuardShape);
hideAndHardenFunction(isAwaitArgGuard);

export function assertAwaitArgGuard(
  specimen: any,
): asserts specimen is AwaitArgGuard {
  mustMatch(specimen, AwaitArgGuardShape, 'awaitArgGuard');
}
hideAndHardenFunction(assertAwaitArgGuard);

const makeAwaitArgGuard = (argPattern: Pattern): AwaitArgGuard => {
  const result = makeTagged('guard:awaitArgGuard', {
    argGuard: argPattern,
  }) as AwaitArgGuard;
  assertAwaitArgGuard(result);
  return result;
};

// M.raw()

const RawGuardPayloadShape = M.record();

export const RawGuardShape = M.kind('guard:rawGuard');

export const isRawGuard = (specimen: any): specimen is RawGuard =>
  matches(specimen, RawGuardShape);

export function assertRawGuard(specimen: any): asserts specimen is RawGuard {
  mustMatch(specimen, RawGuardShape, 'rawGuard');
}

/**
 */
const makeRawGuard = (): RawGuard => makeTagged('guard:rawGuard', {});

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

export function assertMethodGuard(
  specimen: any,
): asserts specimen is MethodGuard {
  mustMatch(specimen, MethodGuardShape, 'methodGuard');
}
hideAndHardenFunction(assertMethodGuard);

/**
 */
const makeMethodGuardMaker = (
  callKind: 'sync' | 'async',
  argGuards: ArgGuard[],
  optionalArgGuards: ArgGuard[] | undefined = undefined,
  restArgGuard: SyncValueGuard | undefined = undefined,
): MethodGuardMaker => {
  const maker = harden({
    optional: (...optArgGuards: ArgGuard[]) => {
      optionalArgGuards === undefined ||
        Fail`Can only have one set of optional guards`;
      restArgGuard === undefined ||
        Fail`optional arg guards must come before rest arg`;
      return makeMethodGuardMaker(callKind, argGuards, optArgGuards);
    },
    rest: (rArgGuard: SyncValueGuard) => {
      restArgGuard === undefined || Fail`Can only have one rest arg`;
      return makeMethodGuardMaker(
        callKind,
        argGuards,
        optionalArgGuards,
        rArgGuard,
      );
    },
    returns: (returnGuard: SyncValueGuard = M.undefined()) => {
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
  return maker as unknown as MethodGuardMaker;
};

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

export function assertInterfaceGuard(
  specimen: any,
): asserts specimen is InterfaceGuard {
  mustMatch(specimen, InterfaceGuardShape, 'interfaceGuard');
}
hideAndHardenFunction(assertInterfaceGuard);

const makeInterfaceGuard = <MG extends Record<PropertyKey, MethodGuard>>(
  interfaceName: string,
  methodGuards: MG,
  options: { sloppy?: boolean; defaultGuards?: DefaultGuardType } = {},
): InterfaceGuard<MG> => {
  const { sloppy = false, defaultGuards = sloppy ? 'passable' : undefined } =
    options;
  // For backwards compatibility, string-keyed method guards are represented in
  // a CopyRecord. But symbol-keyed methods cannot be, so we put those in a
  // CopyMap when present.
  const stringMethodGuards: Record<string, MethodGuard> = {};
  const symbolMethodGuardsEntries: Array<[symbol, MethodGuard]> = [];
  for (const key of ownKeys(methodGuards)) {
    const value = methodGuards[key];
    if (typeof key === 'symbol') {
      symbolMethodGuardsEntries.push([key, value]);
    } else {
      stringMethodGuards[key] = value;
    }
  }
  const result = makeTagged('guard:interfaceGuard', {
    interfaceName,
    methodGuards: stringMethodGuards,
    ...(symbolMethodGuardsEntries.length
      ? { symbolMethodGuards: makeCopyMap(symbolMethodGuardsEntries) }
      : {}),
    defaultGuards,
  }) as unknown as InterfaceGuard<MG>;
  assertInterfaceGuard(result);
  return result;
};

const GuardPayloadShapes = harden({
  'guard:awaitArgGuard': AwaitArgGuardPayloadShape,
  'guard:rawGuard': RawGuardPayloadShape,
  'guard:methodGuard': MethodGuardPayloadShape,
  'guard:interfaceGuard': InterfaceGuardPayloadShape,
});
