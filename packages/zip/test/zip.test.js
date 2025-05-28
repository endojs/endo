import test from 'ava';
import assert from 'node:assert';

import '../src/types.js';
import { ZipWriter } from '../src/writer.js';
import { ZipReader } from '../src/reader.js';

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
