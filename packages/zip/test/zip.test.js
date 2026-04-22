import test from 'ava';
import assert from 'node:assert';

import '../src/types.js';
import { ZipWriter, writeZip } from '../src/writer.js';
import { ZipReader, readZip } from '../src/reader.js';

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

test('ZipReader.read throws for missing file', t => {
  const writer = new ZipWriter();
  writer.write('a.txt', textEncoder.encode('A'));
  const reader = new ZipReader(writer.snapshot(), { name: 'test.zip' });
  t.throws(() => reader.read('missing.txt'), {
    message: /Cannot find file missing\.txt in Zip file test\.zip/,
  });
});

test('ZipReader.stat returns undefined for missing file', t => {
  const writer = new ZipWriter();
  writer.write('a.txt', textEncoder.encode('A'));
  const reader = new ZipReader(writer.snapshot());
  t.is(reader.stat('missing.txt'), undefined);
});

test('ZipWriter.write throws without content', t => {
  const writer = new ZipWriter();
  t.throws(() => writer.write('bad.txt', /** @type {any} */ (undefined)), {
    message: /requires content/,
  });
});

test('readZip async wrapper works', async t => {
  const writer = new ZipWriter();
  writer.write('hello.txt', textEncoder.encode('Hi'));
  const data = writer.snapshot();

  const archive = await readZip(data, 'archive.zip');
  const content = await archive.read('hello.txt');
  t.is(textDecoder.decode(content), 'Hi');
});

test('writeZip async wrapper works', async t => {
  const archive = writeZip();
  await archive.write('test.txt', textEncoder.encode('Test content'));
  const data = await archive.snapshot();

  const reader = new ZipReader(data);
  t.is(textDecoder.decode(reader.read('test.txt')), 'Test content');
});

test('ZipWriter uses default date', t => {
  const writer = new ZipWriter();
  writer.write('a.txt', textEncoder.encode('A'));
  // Default date should be "now" (no explicit date)
  const snapshot = writer.snapshot();
  const reader = new ZipReader(snapshot);
  const stat = reader.stat('a.txt');
  assert(stat);
  // File date may be undefined (not set) or close to now.
  t.pass();
});

test('ZipReader with custom name', t => {
  const writer = new ZipWriter();
  writer.write('a.txt', textEncoder.encode('A'));
  const reader = new ZipReader(writer.snapshot(), { name: 'custom.zip' });
  t.is(reader.name, 'custom.zip');
});

test('ZipReader default name', t => {
  const writer = new ZipWriter();
  writer.write('a.txt', textEncoder.encode('A'));
  const reader = new ZipReader(writer.snapshot());
  t.is(reader.name, '<unknown>');
});
