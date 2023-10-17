export interface AsyncSink<TValue> {
  put(value: TValue | Promise<TValue>): void;
}

export interface AsyncSpring<TValue> {
  get(): Promise<TValue>;
}

export interface AsyncQueue<TSpringValue, TSinkValue = TSpringValue>
  extends AsyncSpring<TSpringValue>,
    AsyncSink<TSinkValue> {}

// Stream is nearly identical to AsyncGenerator and AsyncGenerator should
// probably be identical to this definition of Stream.
// Stream does not make the mistake of conflating the read and write return
// types.
export interface Stream<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
> {
  next(value: TWrite): Promise<IteratorResult<TRead, TReadReturn>>;
  return(value: TWriteReturn): Promise<IteratorResult<TRead, TReadReturn>>;
  throw(error: Error): Promise<IteratorResult<TRead, TReadReturn>>;
  [Symbol.asyncIterator](): Stream<TRead, TWrite, TReadReturn, TWriteReturn>;
}

export type Reader<TRead, TReadReturn = undefined> = Stream<
  TRead,
  undefined,
  TReadReturn,
  undefined
>;
export type Writer<TWrite, TWriteReturn = undefined> = Stream<
  undefined,
  TWrite,
  undefined,
  TWriteReturn
>;

export declare function makeQueue<TValue>(): AsyncQueue<TValue>;

export declare function makeStream<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
>(
  acks: AsyncSpring<IteratorResult<TRead, TReadReturn>>,
  data: AsyncSink<IteratorResult<TWrite, TWriteReturn>>,
): Stream<TRead, TWrite, TReadReturn, TWriteReturn>;

export declare function makePipe<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
>(): [
  Stream<TRead, TWrite, TReadReturn, TWriteReturn>,
  Stream<TWrite, TRead, TWriteReturn, TReadReturn>,
];

export declare function pump<
  TRead,
  TWrite = unknown,
  TReadReturn = unknown,
  TWriteReturn = unknown,
>(
  writer: Stream<TWrite, TRead, TWriteReturn, TReadReturn>,
  reader: Stream<TRead, TWrite, TReadReturn, TWriteReturn>,
  primer?: TWrite,
): Promise<void>;

export declare function prime<TRead>(
  writer: AsyncGenerator<TRead, undefined, undefined>,
): // primer is implicitly undefined for this overload.
Stream<TRead, undefined, undefined, undefined>;
// ESLint hasn't heard about overloads.
// eslint-disable-next-line no-redeclare
export declare function prime<TRead, TWrite = unknown, TReturn = unknown>(
  writer: AsyncGenerator<TRead, TReturn, TWrite>,
  primer: TWrite,
): Stream<TRead, TWrite, TReturn, TReturn>;

export declare function mapReader<
  TReadIn,
  TReadOut = TReadIn,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
>(
  reader: Stream<TReadIn, TWrite, TReadReturn, TWriteReturn>,
  transform: (value: TReadIn) => TReadOut,
): Stream<TReadOut, TWrite, TReadReturn, TWriteReturn>;

export declare function mapWriter<
  TWriteIn,
  TWriteOut = TWriteIn,
  TRead = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
>(
  writer: Stream<TRead, TWriteOut, TReadReturn, TWriteReturn>,
  transform: (value: TWriteIn) => TWriteOut,
): Stream<TRead, TWriteIn, TReadReturn, TWriteReturn>;
