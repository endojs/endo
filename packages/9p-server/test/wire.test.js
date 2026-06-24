// @ts-nocheck
/* global Buffer */
/* eslint-disable import/order */

import '@endo/init';
import test from 'ava';

import {
  makeReader,
  makeWriter,
  tryParseMessage,
  wrapMessage,
} from '../src/wire.js';

test('writer/reader round-trip the basic primitive types', t => {
  const w = makeWriter();
  w.u8(0x12);
  w.u16(0x1234);
  w.u32(0xdead_beef);
  w.u64(0xfedc_ba98_7654_3210n);
  w.str('hello');
  w.bytes(Buffer.from([1, 2, 3, 4]));
  const out = w.finish();

  const r = makeReader(out);
  t.is(r.u8(), 0x12);
  t.is(r.u16(), 0x1234);
  t.is(r.u32(), 0xdead_beef);
  t.is(r.u64(), 0xfedc_ba98_7654_3210n);
  t.is(r.str(), 'hello');
  t.deepEqual([...r.take(4)], [1, 2, 3, 4]);
  t.is(r.remaining(), 0);
});

test('wrapMessage builds the size/type/tag envelope', t => {
  const payload = Buffer.from([0x10, 0x20, 0x30]);
  const env = wrapMessage(100, 7, payload);
  t.is(env.readUInt32LE(0), 7 + payload.length);
  t.is(env.readUInt8(4), 100);
  t.is(env.readUInt16LE(5), 7);
  t.deepEqual([...env.subarray(7)], [0x10, 0x20, 0x30]);
});

test('tryParseMessage handles partial buffers and concatenated frames', t => {
  const m1 = wrapMessage(101, 1, Buffer.from([0xaa]));
  const m2 = wrapMessage(102, 2, Buffer.from([0xbb, 0xcc]));

  // partial: too small
  t.is(tryParseMessage(m1.subarray(0, 3)), null);

  // exact one
  const r1 = tryParseMessage(m1);
  t.truthy(r1);
  t.is(r1?.msg.type, 101);
  t.is(r1?.msg.tag, 1);
  t.deepEqual([...(r1?.msg.payload ?? Buffer.alloc(0))], [0xaa]);
  t.is(r1?.rest.length, 0);

  // two concatenated
  const concat = Buffer.concat([m1, m2]);
  const r1c = tryParseMessage(concat);
  t.is(r1c?.msg.type, 101);
  const r2c = tryParseMessage(r1c?.rest ?? Buffer.alloc(0));
  t.is(r2c?.msg.type, 102);
  t.is(r2c?.msg.tag, 2);
});

test('tryParseMessage rejects frames whose declared size exceeds maxSize', t => {
  // Build a frame whose envelope declares size = 200 but we cap at
  // 100. The header alone is enough — the parser should reject
  // before buffering 200 bytes of payload, so a peer can't force
  // unbounded `Buffer.concat` growth by declaring huge sizes.
  const header = Buffer.alloc(7);
  header.writeUInt32LE(200, 0);
  header.writeUInt8(100, 4);
  header.writeUInt16LE(1, 5);
  t.throws(() => tryParseMessage(header, 100), {
    message: /exceeds max 100/,
  });
});

test('tryParseMessage rejects frames whose declared size < 7-byte envelope', t => {
  const bad = Buffer.alloc(7);
  bad.writeUInt32LE(5, 0); // 5 < 7
  t.throws(() => tryParseMessage(bad), { message: /smaller than envelope/ });
});

test('strings round-trip multi-byte UTF-8', t => {
  const w = makeWriter();
  w.str('日本語/test');
  const r = makeReader(w.finish());
  t.is(r.str(), '日本語/test');
});
