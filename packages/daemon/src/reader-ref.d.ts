export function asyncIterate<T>(iterable: import("./types").SomehowAsyncIterable<T>): import("@endo/stream").Reader<T, undefined>;
export function makeIteratorRef<T>(iterable: import("./types").SomehowAsyncIterable<T>): import("@endo/far").FarRef<import("@endo/stream").Reader<T, undefined>, import("@endo/eventual-send").DataOnly<import("@endo/stream").Reader<T, undefined>>>;
export function makeReaderRef(readable: import('./types').SomehowAsyncIterable<Uint8Array>): import('@endo/far').FarRef<import('@endo/stream').Reader<string>>;
//# sourceMappingURL=reader-ref.d.ts.map