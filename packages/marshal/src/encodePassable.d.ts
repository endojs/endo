export function recordNames<T extends Passable>(record: CopyRecord<T>): string[];
export function recordValues<T extends Passable>(record: CopyRecord<T>, names: string[]): T[];
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
    encodeRemotable?: ((remotable: Remotable, encodeRecur: (p: Passable) => string) => string) | undefined;
    encodePromise?: ((promise: Promise<any>, encodeRecur: (p: Passable) => string) => string) | undefined;
    encodeError?: ((error: Error, encodeRecur: (p: Passable) => string) => string) | undefined;
    format?: "legacyOrdered" | "compactOrdered" | undefined;
};
export type DecodeOptions = {
    decodeRemotable?: ((encodedRemotable: string, decodeRecur: (e: string) => Passable) => Remotable) | undefined;
    decodePromise?: ((encodedPromise: string, decodeRecur: (e: string) => Passable) => Promise<any>) | undefined;
    decodeError?: ((encodedError: string, decodeRecur: (e: string) => Passable) => Error) | undefined;
};
export type PassableKit = {
    encodePassable: ReturnType<(encodeStringSuffix: (str: string) => string, encodeArray: (arr: unknown[], encodeRecur: (p: Passable) => string) => string, options: Required<EncodeOptions> & {
        verifyEncoding?: ((encoded: string, label: string) => void) | undefined;
    }) => (p: Passable) => string>;
    decodePassable: ReturnType<(decodeStringSuffix: (encoded: string) => string, decodeArray: (encoded: string, decodeRecur: (e: string) => Passable, skip?: number | undefined) => unknown[], options: Required<DecodeOptions>) => (encoded: string, skip?: number | undefined) => Passable>;
};
import type { Passable } from '@endo/pass-style';
import type { CopyRecord } from '@endo/pass-style';
import type { PassStyle } from '@endo/pass-style';
import type { RemotableObject as Remotable } from '@endo/pass-style';
//# sourceMappingURL=encodePassable.d.ts.map