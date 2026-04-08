import test from 'ava';
import assert from 'node:assert';

import '../src/types.js';
import { ZipWriter } from '../src/writer.js';
import { ZipReader } from '../src/reader.js';
import { BufferReader } from '../src/buffer-reader.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

test('zip round trip', async t => {
  t.plan(3);

  const expectedDate = new Date(1970, 1);

  const writer = new ZipWriter();
  writer.write('hello/hello.txt', textEncoder.encode('Hello, World!\n'), {
    mode: 0o600,
    date: expectedDate,
  });

  const reader = new ZipReader(writer.snapshot());
  const text = textDecoder.decode(reader.read('hello/hello.txt'));
  const result = reader.stat('hello/hello.txt');
  assert(result);
  const { mode, date } = result;
  // XXX would use optional chaining but it's currently forbidding 2025-05-28
  assert(date);

  t.is(text, 'Hello, World!\n', 'text should match');
  t.is(mode, 0o600, 'mode should match');
  t.is(
    date.getUTCMilliseconds(),
    expectedDate.getUTCMilliseconds(),
    'date should match',
  );
});

test('BufferReader privateFields lookup is per-instance', t => {
  // Regression guard for the privateFieldsGet helper. The bound
  // WeakMap.get retains its receiver and discriminates on the argument;
  // a wrapper that forgot to forward (or that replaced the lookup with a
  // shared module-level closure) would let two readers observe each other's
  // state. Two readers with distinct lengths and indices catch that.
  const r1 = new BufferReader(new Uint8Array([1, 2, 3, 4]).buffer);
  const r2 = new BufferReader(new Uint8Array([10, 20, 30, 40, 50, 60]).buffer);
  t.is(r1.length, 4);
  t.is(r2.length, 6);
  t.is(r1.read(2)[0], 1);
  t.is(r2.read(2)[0], 10);
  // After each reads two bytes, indices advance independently.
  t.is(r1.index, 2);
  t.is(r2.index, 2);
  t.is(r1.read(1)[0], 3);
  t.is(r2.read(1)[0], 30);
  t.is(r1.index, 3);
  t.is(r2.index, 3);
});
