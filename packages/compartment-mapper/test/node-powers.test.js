import test from 'ava';

import url from 'url';

import { makeReadPowers } from '../src/node-powers.js';

/**
 * @param {number} ms
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('makeReadPowers limits concurrent reads with maxConcurrentReads', async t => {
  let activeReads = 0;
  let maxObservedReads = 0;

  const fakeFs = {
    promises: {
      /**
       * @param {string} filePath
       */
      readFile: async filePath => {
        activeReads += 1;
        maxObservedReads = Math.max(maxObservedReads, activeReads);
        await sleep(20);
        activeReads -= 1;
        return Buffer.from(filePath);
      },
    },
  };

  const { read } = makeReadPowers({
    fs: /** @type {any} */ (fakeFs),
    url,
    maxConcurrentReads: 2,
  });

  const a = url.pathToFileURL('/tmp/a.js').href;
  const b = url.pathToFileURL('/tmp/b.js').href;
  const c = url.pathToFileURL('/tmp/c.js').href;

  await Promise.all([read(a), read(b), read(c)]);

  t.is(maxObservedReads, 2);
});

test('makeReadPowers canonical memoizes realpath lookups per location', async t => {
  const calls = [];
  const fakeFs = {
    promises: {
      /**
       * @param {string} filePath
       */
      realpath: async filePath => {
        calls.push(filePath);
        return filePath;
      },
      /**
       * @param {string} filePath
       */
      readFile: async filePath => Buffer.from(filePath),
    },
  };

  const { canonical } = makeReadPowers({
    fs: /** @type {any} */ (fakeFs),
    url,
  });

  const file = url.pathToFileURL('/tmp/file.js').href;
  const dir = url.pathToFileURL('/tmp/pkg').href + '/';

  const [a, b] = await Promise.all([canonical(file), canonical(file)]);
  const [c, d] = await Promise.all([canonical(dir), canonical(dir)]);

  t.is(a, b);
  t.is(c, d);
  t.deepEqual(calls, ['/tmp/file.js', '/tmp/pkg']);
});
