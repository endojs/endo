// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';

import { blobFromBytes } from '../src/blob.js';

test('blobFromBytes exposes bytes through the ReadableBlob surface', async t => {
  const bytes = new TextEncoder().encode('{"answer":42}');
  const blob = blobFromBytes(Promise.resolve(bytes));

  await null;
  t.is(await blob.text(), '{"answer":42}');
  t.deepEqual(await blob.json(), { answer: 42 });

  /** @type {number[]} */
  const recovered = [];
  for await (const chunk of iterateBytesReader(/** @type {any} */ (blob))) {
    recovered.push(...chunk);
  }
  t.deepEqual(recovered, [...bytes]);
});
