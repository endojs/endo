import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

const makePair = bMain => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  makeCapnWebSession(b, { localMain: bMain, gcImports: false });
  return sessionA.getRemoteMain();
};

test('round-trip: undefined', async t => {
  const r = makePair(Far('s', { echo: x => x, peek: () => undefined }));
  t.is(await E(r).echo(undefined), undefined);
  t.is(await E(r).peek(), undefined);
});

test('round-trip: bigint', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  const big = 12345678901234567890n;
  const back = await E(r).echo(big);
  t.is(typeof back, 'bigint');
  t.is(back, big);
});

test('round-trip: Date', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  const d = new Date('2024-06-15T12:34:56.789Z');
  const back = await E(r).echo(d);
  t.true(back instanceof Date);
  t.is(back.getTime(), d.getTime());
});

test('round-trip: Uint8Array', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const back = await E(r).echo(bytes);
  t.true(back instanceof Uint8Array);
  t.is(back.length, bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    t.is(back[i], bytes[i]);
  }
});

test('round-trip: NaN, +Infinity, -Infinity', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  const nan = await E(r).echo(NaN);
  t.true(Number.isNaN(nan));
  t.is(await E(r).echo(Infinity), Infinity);
  t.is(await E(r).echo(-Infinity), -Infinity);
});

test('round-trip: error preserves class and message', async t => {
  const r = makePair(Far('s', { wrap: e => e }));
  const back = await E(r).wrap(new TypeError('oops'));
  t.true(back instanceof TypeError);
  t.is(back.message, 'oops');
});

test('round-trip: unknown error subclass falls back to Error', async t => {
  class CustomError extends Error {}
  const r = makePair(Far('s', { wrap: e => e }));
  const back = await E(r).wrap(new CustomError('weird'));
  // CustomError is unknown to capnweb; receiver decodes as plain Error.
  t.true(back instanceof Error);
  t.is(back.message, 'weird');
});

test('round-trip: nested mix of specials', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  const v = {
    when: new Date(0),
    big: 1n,
    bytes: new Uint8Array([1, 2, 3]),
    nope: undefined,
    nan: NaN,
  };
  const back = await E(r).echo(v);
  t.is(back.when.getTime(), 0);
  t.is(back.big, 1n);
  t.is(back.bytes[2], 3);
  t.is(back.nope, undefined);
  t.true(Number.isNaN(back.nan));
});

test('escaped arrays: 2D arrays preserve shape', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  const grid = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  const back = await E(r).echo(grid);
  t.deepEqual(back, grid);
});

test('escaped arrays: empty array', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  t.deepEqual(await E(r).echo([]), []);
});

test('escaped arrays: array of objects', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  const v = [{ a: 1 }, { b: 2 }];
  t.deepEqual(await E(r).echo(v), v);
});
