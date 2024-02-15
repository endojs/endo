export function makeNetstringReader(input: Iterable<Uint8Array> | AsyncIterable<Uint8Array>, opts?: {
    name?: string | undefined;
    maxMessageLength?: number | undefined;
} | undefined): import('@endo/stream').Reader<Uint8Array, undefined>;
export function netstringReader(input: Iterable<Uint8Array> | AsyncIterable<Uint8Array>, name?: string | undefined, _capacity?: number | undefined): import('@endo/stream').Stream<Uint8Array, undefined>;
//# sourceMappingURL=reader.d.ts.map