export function recordNames<T>(record: CopyRecord<T>): string[];
export function recordValues<T>(record: CopyRecord<T>, names: string[]): T[];
export function zeroPad(n: unknown, size: number): string;
export function makeEncodePassable(encodeOptions?: EncodeOptions | undefined): (passable: Passable) => string;
export function makeDecodePassable(decodeOptions?: DecodeOptions | undefined): (encoded: string) => Passable;
export function isEncodedRemotable(encoded: any): boolean;
/**
 * @type {Record<PassStyle, string>}
 * The single prefix characters to be used for each PassStyle category.
 * `bigint` is a two character string because each of those characters
 * individually is a valid bigint prefix. `n` for "negative" and `p` for
 * "positive". The ordering of these prefixes is the same as the
 * rankOrdering of their respective PassStyles. This table is imported by
 * rankOrder.js for this purpose.
 *
 * In addition, `|` is the remotable->ordinal mapping prefix:
 * This is not used in covers but it is
 * reserved from the same set of strings. Note that the prefix is > any
 * prefix used by any cover so that ordinal mapping keys are always outside
 * the range of valid collection entry keys.
 */
export const passStylePrefixes: Record<PassStyle, string>;
export type PassStyle = import('@endo/pass-style').PassStyle;
export type Passable = import('@endo/pass-style').Passable;
export type Remotable = import('@endo/pass-style').RemotableObject;
export type CopyRecord<T extends unknown = any> = import('@endo/pass-style').CopyRecord<T>;
export type RankCover = import('./types.js').RankCover;
export type EncodeOptions = {
    encodeRemotable?: ((remotable: Remotable, encodeRecur: (p: Passable) => string) => string) | undefined;
    encodePromise?: ((promise: Promise<any>, encodeRecur: (p: Passable) => string) => string) | undefined;
    encodeError?: ((error: Error, encodeRecur: (p: Passable) => string) => string) | undefined;
};
export type DecodeOptions = {
    decodeRemotable?: ((encodedRemotable: string, decodeRecur: (e: string) => Passable) => Remotable) | undefined;
    decodePromise?: ((encodedPromise: string, decodeRecur: (e: string) => Passable) => Promise<any>) | undefined;
    decodeError?: ((encodedError: string, decodeRecur: (e: string) => Passable) => Error) | undefined;
};
//# sourceMappingURL=encodePassable.d.ts.map