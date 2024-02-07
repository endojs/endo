export {
  isKey,
  assertKey,
  assertScalarKey,
  isCopySet,
  assertCopySet,
  makeCopySet,
  getCopySetKeys,
  isCopyBag,
  assertCopyBag,
  makeCopyBag,
  makeCopyBagFromElements,
  getCopyBagEntries,
  isCopyMap,
  assertCopyMap,
  makeCopyMap,
  getCopyMapEntries,
} from './src/keys/checkKey.js';
export { coerceToElements } from './src/keys/copySet.js';
export { coerceToBagEntries } from './src/keys/copyBag.js';
export {
  bagCompare,
  setCompare,
  compareKeys,
  keyLT,
  keyLTE,
  keyEQ,
  keyGTE,
  keyGT,
} from './src/keys/compareKeys.js';
export {
  elementsIsSuperset,
  elementsIsDisjoint,
  elementsCompare,
  elementsUnion,
  elementsDisjointUnion,
  elementsIntersection,
  elementsDisjointSubtract,
  setIsSuperset,
  setIsDisjoint,
  setUnion,
  setDisjointUnion,
  setIntersection,
  setDisjointSubtract,
} from './src/keys/merge-set-operators.js';

export {
  bagIsSuperbag,
  bagUnion,
  bagIntersection,
  bagDisjointSubtract,
} from './src/keys/merge-bag-operators.js';

export {
  M,
  getRankCover,
  isPattern,
  assertPattern,
  matches,
  mustMatch,
  isAwaitArgGuard,
  assertAwaitArgGuard,
  isRawGuard,
  assertRawGuard,
  assertMethodGuard,
  assertInterfaceGuard,
  kindOf,
} from './src/patterns/patternMatchers.js';

export {
  getAwaitArgGuardPayload,
  getMethodGuardPayload,
  getInterfaceGuardPayload,
  getInterfaceMethodKeys,
} from './src/patterns/getGuardPayloads.js';

// eslint-disable-next-line import/export
export * from './src/types.js';

// /////////////////////////// Deprecated //////////////////////////////////////

export {
  /**
   * @deprecated
   * Import directly from `@endo/common/list-difference.js` instead.
   */
  listDifference,
} from '@endo/common/list-difference.js';

export {
  /**
   * @deprecated
   * Import directly from `@endo/common/object-map.js` instead.
   */
  objectMap,
} from '@endo/common/object-map.js';
