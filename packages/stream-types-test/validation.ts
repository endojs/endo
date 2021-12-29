/* eslint-disable no-unused-vars, no-underscore-dangle, no-empty */
/// <reference types="ses"/>

import { makeQueue, makeStream, makePipe } from '@endo/stream';
// eslint-disable-next-line
import type { Stream, Reader, Writer } from '@endo/stream';

async () => {
  const q = makeQueue<number>();
  q.put(1);
  q.put(Promise.resolve(1));
  // @ts-expect-error
  q.put('NaN'); // it's a string!
  const a : number = await q.get();
}

async () => {
  const q = makeQueue<IteratorResult<number>>();
  const r = makeQueue<IteratorResult<undefined>>();
  const s = makeStream(q, r);
  for await (const value of s) {
    const cast : number = value;
  }

  const t = makeStream(r, q);
  // @ts-expect-error
  for await (const value of t) {}
};

async () => {
  const [reader, writer] = makePipe<number>();
  for await (const _ of reader) {}
  await writer.next(1);
  // @ts-expect-error
  await writer.next('NaN');
  // @ts-expect-error
  for await (const _ of writer) {}
};

async () => {
  const [reader, writer] = makePipe<undefined, number>();
  const r : IteratorResult<undefined> = await reader.next(1);
  // @ts-expect-error
  const s : IteratorResult<undefined> = await reader.next('NaN');
  // @ts-expect-error
  for await (const _ of reader) {}
  for await (const value of writer) {
    const cast : number = value;
  }
};

async () => {
  const [reader, writer] = makePipe<number, string, boolean, Array<number>>();
  const a: IteratorResult<number, boolean> = await reader.next('A');
  const b: IteratorResult<number, boolean> = await reader.return([1, 2, 3]);
  const c: IteratorResult<number, boolean> = await reader.throw(new Error('Abort'));
  const d: IteratorResult<string, Array<number>> = await writer.next(1);
  const e: IteratorResult<string, Array<number>> = await writer.return(true);
  const f: IteratorResult<string, Array<number>> = await writer.throw(new Error('Abort'));
};
