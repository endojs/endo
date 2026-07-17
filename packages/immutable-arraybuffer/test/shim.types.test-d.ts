import { expectType } from 'tsd';

import '@endo/immutable-arraybuffer/shim.js';

const arr = new ArrayBuffer(10);
expectType<ArrayBuffer>(arr.sliceToImmutable());
expectType<ArrayBuffer>(arr.transferToImmutable());
expectType<boolean>(arr.immutable);
