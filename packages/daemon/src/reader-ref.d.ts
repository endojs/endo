export function asyncIterate<T>(iterable: SomehowAsyncIterable<T>): Reader<T>;
export function makeIteratorRef<T>(iterable: SomehowAsyncIterable<T>): FarRef<Reader<T>>;
export function makeReaderRef(readable: SomehowAsyncIterable<Uint8Array>): FarRef<Reader<string>>;
import type { SomehowAsyncIterable } from './types.js';
import type { Reader } from '@endo/stream';
import type { FarRef } from '@endo/eventual-send';
//# sourceMappingURL=reader-ref.d.ts.map