export function makeEncodeToSmallcaps(encodeOptions?: EncodeToSmallcapsOptions | undefined): (passable: Passable) => SmallcapsEncoding;
export function makeDecodeFromSmallcaps(decodeOptions?: DecodeFromSmallcapsOptions | undefined): (encoded: SmallcapsEncoding) => Passable;
export type SmallcapsEncoding = any;
export type SmallcapsEncodingUnion = any;
export type EncodeToSmallcapsOptions = {
    encodeRemotableToSmallcaps?: ((remotable: typeof Remotable, encodeRecur: (p: Passable) => SmallcapsEncoding) => SmallcapsEncoding) | undefined;
    encodePromiseToSmallcaps?: ((promise: Promise<any>, encodeRecur: (p: Passable) => SmallcapsEncoding) => SmallcapsEncoding) | undefined;
    encodeErrorToSmallcaps?: ((error: Error, encodeRecur: (p: Passable) => SmallcapsEncoding) => SmallcapsEncoding) | undefined;
};
export type DecodeFromSmallcapsOptions = {
    decodeRemotableFromSmallcaps?: ((encodedRemotable: SmallcapsEncoding, decodeRecur: (e: SmallcapsEncoding) => Passable) => typeof Remotable) | undefined;
    decodePromiseFromSmallcaps?: ((encodedPromise: SmallcapsEncoding, decodeRecur: (e: SmallcapsEncoding) => Passable) => Promise<any>) | undefined;
    decodeErrorFromSmallcaps?: ((encodedError: SmallcapsEncoding, decodeRecur: (e: SmallcapsEncoding) => Passable) => Error) | undefined;
};
import type { Passable } from '@endo/pass-style';
import type { Remotable } from '@endo/pass-style';
//# sourceMappingURL=encodeToSmallcaps.d.ts.map