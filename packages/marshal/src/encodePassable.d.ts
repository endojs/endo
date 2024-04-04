export function recordNames<T>(record: CopyRecord<T>): string[];
export function recordValues<T>(record: CopyRecord<T>, names: string[]): T[];
export function zeroPad(n: unknown, size: number): string;
export function makePassableKit(options?: (EncodeOptions & DecodeOptions) | undefined): PassableKit;
export function makeEncodePassable(encodeOptions?: EncodeOptions | undefined): PassableKit['encodePassable'];
export function makeDecodePassable(decodeOptions?: DecodeOptions | undefined): PassableKit['decodePassable'];
export function isEncodedRemotable(encoded: any): boolean;
/**
 * @type {Record<PassStyle, string>}
 * The single prefix characters to be used for each PassStyle category.
 * `bigint` is a two-character string because each of those characters
 * individually is a valid bigint prefix (`n` for "negative" and `p` for
 * "positive"), and copyArray is a two-character string because one encoding
 * prefixes arrays with `[` while the other uses `^` (which is prohibited from
 * appearing in an encoded string).
 * The ordering of these prefixes is the same as the rankOrdering of their
 * respective PassStyles, and rankOrder.js imports the table for this purpose.
 *
 * In addition, `|` is the remotable->ordinal mapping prefix:
 * This is not used in covers but it is
 * reserved from the same set of strings. Note that the prefix is > any
 * prefix used by any cover so that ordinal mapping keys are always outside
 * the range of valid collection entry keys.
 */
export const passStylePrefixes: Record<PassStyle, string>;
export type EncodeOptions = {
    encodeRemotable?: ((remotable: any, encodeRecur: (p: any) => string) => string) | undefined;
    encodePromise?: ((promise: Promise<any>, encodeRecur: (p: any) => string) => string) | undefined;
    encodeError?: ((error: Error, encodeRecur: (p: any) => string) => string) | undefined;
    format?: "legacyOrdered" | "compactOrdered" | undefined;
};
export type DecodeOptions = {
    decodeRemotable?: ((encodedRemotable: string, decodeRecur: (e: string) => any) => any) | undefined;
    decodePromise?: ((encodedPromise: string, decodeRecur: (e: string) => any) => Promise<any>) | undefined;
    decodeError?: ((encodedError: string, decodeRecur: (e: string) => any) => Error) | undefined;
};
export type PassableKit = {
    encodePassable: ReturnType<(encodeStringSuffix: (str: string) => string, encodeArray: (arr: unknown[], encodeRecur: (p: any) => string) => string, options: Required<EncodeOptions> & {
        verifyEncoding?: ((encoded: string, label: string) => void) | undefined;
    }) => (p: any) => string>;
    decodePassable: ReturnType<(decodeStringSuffix: (encoded: string) => string, decodeArray: (encoded: string, decodeRecur: (e: string) => any, skip?: number | undefined) => unknown[], options: Required<DecodeOptions>) => (encoded: string, skip?: number | undefined) => any>;
};
import type { CopyRecord } from '@endo/pass-style';
import type { PassStyle } from '@endo/pass-style';
//# sourceMappingURL=encodePassable.d.ts.map