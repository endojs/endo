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
  mapCompare,
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
  assertMethodGuard,
  assertInterfaceGuard,
} from './src/patterns/patternMatchers.js';

// ////////////////// Temporary, until these find their proper home ////////////

export { listDifference, objectMap } from './src/utils.js';

// eslint-disable-next-line import/export
export * from './src/types.js';
