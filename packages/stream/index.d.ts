export function makeQueue<T>(): import("./types.js").AsyncQueue<T, T>;
export function makeStream<TRead, TWrite, TReadReturn, TWriteReturn>(acks: import("./types.js").AsyncSpring<IteratorResult<TRead, TReadReturn>>, data: import("./types.js").AsyncSink<IteratorResult<TWrite, TWriteReturn>>): {
    /**
     * @param {TWrite} value
     */
    next(value: TWrite): Promise<IteratorResult<TRead, TReadReturn>>;
    /**
     * @param {TWriteReturn} value
     */
    return(value: TWriteReturn): Promise<IteratorResult<TRead, TReadReturn>>;
    /**
     * @param {Error} error
     */
    throw(error: Error): Promise<IteratorResult<TRead, TReadReturn>>;
    [Symbol.asyncIterator](): any;
};
export function makePipe(): {
    /**
     * @param {TWrite} value
     */
    next(value: any): Promise<IteratorResult<any, any>>;
    /**
     * @param {TWriteReturn} value
     */
    return(value: any): Promise<IteratorResult<any, any>>;
    /**
     * @param {Error} error
     */
    throw(error: Error): Promise<IteratorResult<any, any>>;
    [Symbol.asyncIterator](): any;
}[];
export function pump<TRead, TWrite, TReadReturn, TWriteReturn>(writer: import("./types.js").Stream<TWrite, TRead, TWriteReturn, TReadReturn>, reader: import("./types.js").Stream<TRead, TWrite, TReadReturn, TWriteReturn>, primer: TWrite): Promise<undefined>;
export function prime<TRead, TWrite, TReturn>(generator: AsyncGenerator<TRead, TReturn, TWrite>, primer: TWrite): {
    /** @param {TWrite} value */
    next(value: TWrite): Promise<IteratorResult<TRead, TReturn>>;
    /** @param {TReturn} value */
    return(value: TReturn): Promise<IteratorResult<TRead, TReturn>>;
    /** @param {Error} error */
    throw(error: Error): Promise<IteratorResult<TRead, TReturn>>;
};
export function mapReader<TIn, TOut>(reader: import("./types.js").Reader<TIn, undefined>, transform: (value: TIn) => TOut): import("./types.js").Reader<TOut, undefined>;
export function mapWriter<TIn, TOut>(writer: import("./types.js").Writer<TOut, undefined>, transform: (value: TIn) => TOut): import("./types.js").Writer<TIn, undefined>;
export type PromiseKit<T> = {
    resolve(value?: T | Promise<T>): void;
    reject(error: Error): void;
    promise: Promise<T>;
};
//# sourceMappingURL=index.d.ts.map