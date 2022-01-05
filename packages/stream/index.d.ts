export * from './types.js';
import { AsyncQueue, Stream, Reader, Writer } from './types.js';

export function makeQueue<TValue>(): AsyncQueue<TValue>;

export function makeStream<
  TRead,
  TWrite = unknown,
  TReadReturn = unknown,
  TWriteReturn = unknown,
>(
  acks: AsyncQueue<IteratorResult<TRead, TReadReturn>>,
  data: AsyncQueue<IteratorResult<TWrite, TWriteReturn>>,
): Stream<TRead, TWrite, TReadReturn, TWriteReturn>;

export function makePipe<
  TRead,
  TWrite = unknown,
  TReadReturn = unknown,
  TWriteReturn = unknown,
>(): [
  Stream<TRead, TWrite, TReadReturn, TWriteReturn>,
  Stream<TWrite, TRead, TWriteReturn, TReadReturn>,
];
