export function makeEncodeToSmallcaps(encodeOptions?: EncodeToSmallcapsOptions | undefined): (passable: any) => SmallcapsEncoding;
export function makeDecodeFromSmallcaps(decodeOptions?: DecodeFromSmallcapsOptions | undefined): (encoded: SmallcapsEncoding) => any;
export type SmallcapsEncoding = any;
export type SmallcapsEncodingUnion = any;
export type EncodeToSmallcapsOptions = {
    encodeRemotableToSmallcaps?: ((remotable: typeof Remotable, encodeRecur: (p: any) => SmallcapsEncoding) => SmallcapsEncoding) | undefined;
    encodePromiseToSmallcaps?: ((promise: Promise<any>, encodeRecur: (p: any) => SmallcapsEncoding) => SmallcapsEncoding) | undefined;
    encodeErrorToSmallcaps?: ((error: Error, encodeRecur: (p: any) => SmallcapsEncoding) => SmallcapsEncoding) | undefined;
};
export type DecodeFromSmallcapsOptions = {
    decodeRemotableFromSmallcaps?: ((encodedRemotable: SmallcapsEncoding, decodeRecur: (e: SmallcapsEncoding) => any) => typeof Remotable) | undefined;
    decodePromiseFromSmallcaps?: ((encodedPromise: SmallcapsEncoding, decodeRecur: (e: SmallcapsEncoding) => any) => Promise<any>) | undefined;
    decodeErrorFromSmallcaps?: ((encodedError: SmallcapsEncoding, decodeRecur: (e: SmallcapsEncoding) => any) => Error) | undefined;
};
import type { Remotable } from '@endo/pass-style';
//# sourceMappingURL=encodeToSmallcaps.d.ts.map