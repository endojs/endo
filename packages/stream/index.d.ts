import { AsyncSpring, AsyncSink, AsyncQueue, Stream } from './types.js';

export * from './types.js';

export declare function makeQueue<TValue>(): AsyncQueue<TValue>;

export declare const nullQueue: AsyncQueue<void, unknown>;

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

export declare function makeTopic<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
>(): {
  publisher: Stream<void, TWrite, void, TWriteReturn>;
  subscribe: () => Stream<TRead, unknown, TReadReturn, unknown>;
};

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
