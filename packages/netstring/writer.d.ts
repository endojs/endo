export function makeNetstringWriter(output: import('@endo/stream').Writer<Uint8Array, undefined>, { chunked }?: {
    chunked?: boolean | undefined;
}): import('@endo/stream').Writer<Uint8Array | Uint8Array[], undefined>;
export function netstringWriter(output: import('@endo/stream').Writer<Uint8Array, undefined>, { chunked }?: {
    chunked?: boolean | undefined;
}): import('@endo/stream').Writer<Uint8Array | Uint8Array[], undefined>;
//# sourceMappingURL=writer.d.ts.map