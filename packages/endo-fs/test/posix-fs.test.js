// @ts-nocheck
/* eslint-disable import/order */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';

import { makeInMemoryFilesystem } from '../src/in-memory.js';
import { synthesizePosixFs } from '../src/posix-fs.js';

test('PosixFs.attrs synthesizes POSIX-shaped record over a base Filesystem', async t => {
  const fs = makeInMemoryFilesystem();
  const posix = synthesizePosixFs(fs);
  const root = await E(fs).root();
  const dir = await E(root).makeDirectory('a', {});

  const dirAttrs = await E(posix).attrs(dir);
  t.is(dirAttrs.mode, 0o755);
  t.is(dirAttrs.uid, 0);
  t.is(dirAttrs.gid, 0);
  t.is(dirAttrs.nlink, 1);
  t.is(typeof dirAttrs.pathId, 'bigint');
  t.is(typeof dirAttrs.mtime, 'bigint');
});

test('PosixFs.attrs reports default file mode for files', async t => {
  const fs = makeInMemoryFilesystem();
  const posix = synthesizePosixFs(fs);
  const root = await E(fs).root();
  const oh = await E(root).create('x', { write: true });
  await E(oh).close();
  const file = await E(root).lookup('x');

  const attrs = await E(posix).attrs(file);
  t.is(attrs.mode, 0o644);
});

test('PosixFs.setAttrs rejects POSIX-specific updates in the synth impl', async t => {
  const fs = makeInMemoryFilesystem();
  const posix = synthesizePosixFs(fs);
  const root = await E(fs).root();
  await t.throwsAsync(
    () => E(posix).setAttrs(root, { mode: 0o600 }),
    { message: /ENOSYS/ },
  );
  await t.throwsAsync(
    () => E(posix).setAttrs(root, { uid: 1000 }),
    { message: /ENOSYS/ },
  );
});

test('PosixFs.setAttrs no-ops on empty patches', async t => {
  const fs = makeInMemoryFilesystem();
  const posix = synthesizePosixFs(fs);
  const root = await E(fs).root();
  await E(posix).setAttrs(root, {});
  t.pass();
});
