export * from './types.js';
import { AsyncQueue, Stream, Reader, Writer } from './types.js';

export function makeQueue<TValue>(): AsyncQueue<TValue>;

export function makeStream<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
>(
  acks: AsyncQueue<IteratorResult<TRead, TReadReturn>>,
  data: AsyncQueue<IteratorResult<TWrite, TWriteReturn>>,
): Stream<TRead, TWrite, TReadReturn, TWriteReturn>;

export function makePipe<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
>(): [
  Stream<TRead, TWrite, TReadReturn, TWriteReturn>,
  Stream<TWrite, TRead, TWriteReturn, TReadReturn>,
];

export function mapReader<
  TReadIn,
  TReadOut = TReadIn,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
>(
  reader: Stream<TReadIn, TWrite, TReadReturn, TWriteReturn>,
  transform: (value: TReadIn) => TReadOut,
): Stream<TReadOut, TWrite, TReadReturn, TWriteReturn>;

export function mapWriter<
  TWriteIn,
  TWriteOut = TWriteIn,
  TRead = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
>(
  writer: Stream<TRead, TWriteOut, TReadReturn, TWriteReturn>,
  transform: (value: TWriteIn) => TWriteOut,
): Stream<TRead, TWriteIn, TReadReturn, TWriteReturn>;
