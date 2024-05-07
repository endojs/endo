export function makeEncodeToCapData(encodeOptions?: EncodeToCapDataOptions | undefined): (passable: Passable) => Encoding;
export function makeDecodeFromCapData(decodeOptions?: DecodeOptions | undefined): (encoded: Encoding) => Passable;
export type EncodeToCapDataOptions = {
    encodeRemotableToCapData?: ((remotable: RemotableObject, encodeRecur: (p: Passable) => Encoding) => Encoding) | undefined;
    encodePromiseToCapData?: ((promise: Promise<any>, encodeRecur: (p: Passable) => Encoding) => Encoding) | undefined;
    encodeErrorToCapData?: ((error: Error, encodeRecur: (p: Passable) => Encoding) => Encoding) | undefined;
};
export type DecodeOptions = {
    decodeRemotableFromCapData?: ((encodedRemotable: Encoding, decodeRecur: (e: Encoding) => Passable) => Promise<any> | RemotableObject) | undefined;
    decodePromiseFromCapData?: ((encodedPromise: Encoding, decodeRecur: (e: Encoding) => Passable) => Promise<any> | RemotableObject) | undefined;
    decodeErrorFromCapData?: ((encodedError: Encoding, decodeRecur: (e: Encoding) => Passable) => Error) | undefined;
};
/**
 * Special property name that indicates an encoding that needs special
 * decoding.
 */
export const QCLASS: "@qclass";
import type { Passable } from '@endo/pass-style';
import type { Encoding } from './types.js';
import type { RemotableObject } from '@endo/pass-style';
//# sourceMappingURL=encodeToCapData.d.ts.map