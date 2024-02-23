export function makeRefIterator<TValue, TReturn, TNext>(iteratorRef: import("@endo/far").ERef<AsyncIterator<TValue, TReturn, TNext>>): {
    /** @param {[] | [TNext]} args */
    next: (...args: [] | [TNext]) => Promise<IteratorResult<TValue, TReturn>>;
    /** @param {[] | [TReturn]} args */
    return: (...args: [] | [TReturn]) => Promise<IteratorResult<TValue, TReturn>>;
    /** @param {any} error */
    throw: (error: any) => Promise<IteratorResult<TValue, TReturn>>;
    [Symbol.asyncIterator]: () => any;
};
export function makeRefReader(readerRef: import('@endo/far').ERef<AsyncIterator<string>>): AsyncIterableIterator<Uint8Array>;
//# sourceMappingURL=ref-reader.d.ts.map