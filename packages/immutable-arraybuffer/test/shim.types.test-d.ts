import { expectTypeOf } from 'expect-type';

import '@endo/immutable-arraybuffer/shim.js';

const arr = new ArrayBuffer(10);
expectTypeOf(arr.sliceToImmutable()).toEqualTypeOf<ArrayBuffer>();
expectTypeOf(arr.transferToImmutable()).toEqualTypeOf<ArrayBuffer>();
expectTypeOf(arr.immutable).toEqualTypeOf<boolean>();
