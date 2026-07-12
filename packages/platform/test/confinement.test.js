// @ts-check

/**
 * Tests for the shared confinement primitives (`@endo/platform/fs/confinement`):
 * the realpath classifier that turns a throwing `realPath` into a `maybeRealPath`
 * and the containment predicate. The classifier only swallows a *missing
 * referent* to `undefined`; a programmer error (e.g. a `RangeError`) must
 * propagate rather than be masked as "unresolvable".
 */

import '@endo/init/debug.js';

import test from 'ava';
import { makeMaybeRealPath, isPathWithin } from '../src/fs/confinement.js';

/**
 * @param {string} code
 * @returns {Error & { code: string }}
 */
const systemError = code => Object.assign(new Error(code), { code });

test('makeMaybeRealPath resolves an existing path through', async t => {
  await null;
  const maybeRealPath = makeMaybeRealPath(async p => `/real${p}`);
  t.is(await maybeRealPath('/x'), '/real/x');
});

test('makeMaybeRealPath maps a missing referent to undefined', async t => {
  await null;
  for (const code of ['ENOENT', 'ENOTDIR', 'ELOOP']) {
    const maybeRealPath = makeMaybeRealPath(async () => {
      throw systemError(code);
    });
    // eslint-disable-next-line no-await-in-loop
    t.is(await maybeRealPath('/gone'), undefined, `${code} -> undefined`);
  }
});

test('makeMaybeRealPath lets a programmer error propagate', async t => {
  const maybeRealPath = makeMaybeRealPath(async () => {
    throw new RangeError('bug');
  });
  await t.throwsAsync(() => maybeRealPath('/x'), { instanceOf: RangeError });
});

test('makeMaybeRealPath lets an unexpected system error propagate', async t => {
  const maybeRealPath = makeMaybeRealPath(async () => {
    throw systemError('EACCES');
  });
  await t.throwsAsync(() => maybeRealPath('/x'), { message: 'EACCES' });
});

test('isPathWithin honors identity, descendants, and the empty cases', t => {
  t.true(isPathWithin('/root', '/root'));
  t.true(isPathWithin('/root/a/b', '/root'));
  t.false(isPathWithin('/rootsibling', '/root'));
  t.false(isPathWithin('/elsewhere', '/root'));
  t.false(isPathWithin(undefined, '/root'));
  t.false(isPathWithin('/root/a', undefined));
});
