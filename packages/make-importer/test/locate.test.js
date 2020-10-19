import test from 'ava';

import { makeSuffixLocator } from '../src/main';

test('suffix locator', async t => {
  try {
    const locate = makeSuffixLocator('.mjs');
    await t.rejects(
      locate('@agoric/evaluate'),
      TypeError,
      'cannot locate scopes',
    );
    await t.rejects(
      locate('./root.js'),
      TypeError,
      'cannot locate relative paths',
    );
    await t.rejects(
      locate('/foo/bar.mjs'),
      TypeError,
      `cannot locate absolute paths`,
    );
    t.is(
      await locate('https://example.com/t'),
      'https://example.com/t.mjs',
      `locate appends suffix`,
    );
    t.is(
      await locate('http://example.com/t/u.mjs'),
      'http://example.com/t/u.mjs',
      `locate does not double-append suffix`,
    );
    t.is(
      await locate('http://example.com/t/'),
      'http://example.com/t/index.mjs',
      `locate uses index for trailing slash`,
    );
  } catch (e) {
    t.not(e, e, 'unexpected exception');
  } finally {
  }
});
