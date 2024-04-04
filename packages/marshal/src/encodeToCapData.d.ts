export function makeEncodeToCapData(encodeOptions?: EncodeToCapDataOptions | undefined): (passable: any) => Encoding;
export function makeDecodeFromCapData(decodeOptions?: DecodeOptions | undefined): (encoded: Encoding) => any;
export type EncodeToCapDataOptions = {
    encodeRemotableToCapData?: ((remotable: typeof Remotable, encodeRecur: (p: any) => Encoding) => Encoding) | undefined;
    encodePromiseToCapData?: ((promise: Promise<any>, encodeRecur: (p: any) => Encoding) => Encoding) | undefined;
    encodeErrorToCapData?: ((error: Error, encodeRecur: (p: any) => Encoding) => Encoding) | undefined;
};
export type DecodeOptions = {
    decodeRemotableFromCapData?: ((encodedRemotable: Encoding, decodeRecur: (e: Encoding) => any) => (Promise<any> | typeof Remotable)) | undefined;
    decodePromiseFromCapData?: ((encodedPromise: Encoding, decodeRecur: (e: Encoding) => any) => (Promise<any> | typeof Remotable)) | undefined;
    decodeErrorFromCapData?: ((encodedError: Encoding, decodeRecur: (e: Encoding) => any) => Error) | undefined;
};
/**
 * Special property name that indicates an encoding that needs special
 * decoding.
 */
export const QCLASS: "@qclass";
import type { Encoding } from './types.js';
import type { Remotable } from '@endo/pass-style';
//# sourceMappingURL=encodeToCapData.d.ts.map