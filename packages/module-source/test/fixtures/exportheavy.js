/* eslint-disable */
console.error("This is a code sample for trying out babel transforms, it's not meant to be run");

export { mapIterable, filterIterable } from './src/helpers/iter-helpers.js';
export {
  PASS_STYLE,
  isObject,
  assertChecker,
  getTag,
  hasOwnPropertyOf,
} from './src/helpers/passStyle-helpers.js';

export { getErrorConstructor, toPassableError } from './src/helpers/error.js';
export { getInterfaceOf } from './src/helpers/remotable.js';

export {
  nameForPassableSymbol,
  passableSymbolForName,
} from './src/helpers/symbol.js';

export { passStyleOf, assertPassable } from './src/passStyleOf.js';

export { deeplyFulfilled } from './src/deeplyFulfilled.js';

export { makeTagged } from './src/makeTagged.js';
export { Remotable, Far, ToFarFunction } from './src/make-far.js';

export { QCLASS, makeMarshal } from './src/marshal.js';
export { stringify, parse } from './src/marshal-stringify.js';
// Works, but not yet used
// export { decodeToJustin } from './src/marshal-justin.js';

export {
  assertRecord,
  assertCopyArray,
  assertRemotable,
  isRemotable,
  isRecord,
  isCopyArray,
} from './src/typeGuards.js';

// eslint-disable-next-line import/export
export * from './src/types.js';


const { details: X, Fail } = assert;

// This is a pathological minimum, but exercised by the unit test.
export const MIN_DATA_BUFFER_LENGTH = 1;

// Calculate how big the transfer buffer needs to be.
export const TRANSFER_OVERHEAD_LENGTH =
  BigUint64Array.BYTES_PER_ELEMENT + Int32Array.BYTES_PER_ELEMENT;
export const MIN_TRANSFER_BUFFER_LENGTH =
  MIN_DATA_BUFFER_LENGTH + TRANSFER_OVERHEAD_LENGTH;
