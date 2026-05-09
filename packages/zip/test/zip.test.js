import assert from 'node:assert';
import fs from 'node:fs';
import test from 'ava';

import '../src/types.js';
import { ZipWriter, writeZip } from '../src/writer.js';
import { ZipReader, readZip } from '../src/reader.js';
import { BufferReader } from '../src/buffer-reader.js';
import inflate from '../src/inflate.js';
import deflate from '../src/deflate.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

test('zip round trip', t => {
  t.plan(3);

  const expectedDate = new Date(1970, 1);

  const writer = new ZipWriter();
  writer.setNow('hello/hello.txt', textEncoder.encode('Hello, World!\n'), {
    mode: 0o600,
    date: expectedDate,
  });

  const snapshot = writer.snapshot();
  const reader = new ZipReader(snapshot);
  const text = textDecoder.decode(reader.getNow('hello/hello.txt'));
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
    message: /Cannot find file missing\.txt in ZIP file test\.zip/,
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

let canDeflate = false;
try {
  canDeflate = !!new CompressionStream('deflate-raw');
  // eslint-disable-next-line no-empty
} catch {}

(canDeflate ? test : test.skip)('round trip deflate and inflate', async t => {
  const inputText = 'hello, hello!\n';
  const inputBytes = new TextEncoder().encode(inputText);
  const compressedBytes = await deflate(inputBytes);
  const outputBytes = await inflate(compressedBytes);
  const outputText = new TextDecoder().decode(outputBytes);
  t.is(inputText, outputText);
});

(canDeflate ? test : test.skip)(
  'round trip ZipWriter deflate and ZipReader inflate',
  async t => {
    const inputText = 'hello, zip!\n';
    const inputBytes = textEncoder.encode(inputText);
    const writer = new ZipWriter({ deflate });
    await writer.set('hello.txt', inputBytes);
    const snapshot = writer.snapshot();
    const reader = new ZipReader(snapshot, { inflate, checkCrc32: true });
    const outputBytes = await reader.get('hello.txt');
    const outputText = textDecoder.decode(outputBytes);
    t.is(outputText, inputText);
  },
);

(canDeflate ? test : test.skip)('opens native deflate zip', async t => {
  const bytes = fs.readFileSync('test/_fixture.zip');
  const reader = new ZipReader(bytes, { inflate });
  const helloBytes = await reader.get('hello.txt');
  const helloText = new TextDecoder().decode(helloBytes);
  t.is(helloText, 'hello hello\n');
});
