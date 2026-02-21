import assert from 'node:assert';
import fs from 'node:fs';
import test from 'ava';

import '../src/types.js';
import { ZipWriter } from '../src/writer.js';
import { ZipReader } from '../src/reader.js';
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
