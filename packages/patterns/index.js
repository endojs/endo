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
  getAwaitArgGuardPayload,
  isRawGuard,
  assertRawGuard,
  assertMethodGuard,
  getMethodGuardPayload,
  getInterfaceMethodKeys,
  assertInterfaceGuard,
  getInterfaceGuardPayload,
  kindOf,
} from './src/patterns/patternMatchers.js';

// eslint-disable-next-line import/export
export * from './src/types.js';

// /////////////////////////// Deprecated //////////////////////////////////////

export {
  /**
   * @deprecated
   * Import directly from `@endo/utils` instead.
   */
  listDifference,

  /**
   * @deprecated
   * Import directly from `@endo/utils` instead.
   */
  objectMap,
} from '@endo/utils';
