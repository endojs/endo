// @ts-check
/// <reference types="ses"/>

import test from '@endo/ses-ava/prepare-endo.js';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { gitClone } from '../src/index.js';

test('gitClone rejects unsafe clone boundaries before transport', async t => {
  const nonEmptyDestination = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'git-clone-nonempty-'),
  );
  t.teardown(() =>
    fs.promises.rm(nonEmptyDestination, { recursive: true, force: true }),
  );
  await fs.promises.writeFile(path.join(nonEmptyDestination, 'occupied'), '');

  await t.throwsAsync(
    gitClone({
      url: 'http://github.com/example/repo.git',
      destPath: '/tmp/unused-clone',
    }),
    { message: /HTTP remotes are not supported/ },
  );
  await t.throwsAsync(
    gitClone({
      url: 'https://token@github.com/example/repo.git',
      destPath: '/tmp/unused-clone',
    }),
    { message: /must not include embedded credentials/ },
  );
  await t.throwsAsync(
    gitClone({
      url: 'file:///tmp/repo.git',
      destPath: '/tmp/unused-clone',
      allowLocalFileTransport: true,
      credential: { kind: 'bearer', material: { token: 'test-token' } },
    }),
    { message: /credentials require https remotes/ },
  );
  await t.throwsAsync(
    gitClone({
      url: 'file:///tmp/repo.git',
      destPath: '/tmp/unused-clone',
    }),
    { message: /file transport requires allowLocalFileTransport/ },
  );
  await t.throwsAsync(
    gitClone({
      url: 'file:///tmp/repo.git',
      destPath: nonEmptyDestination,
      allowLocalFileTransport: true,
    }),
    { message: /destination mount must be empty/ },
  );
});
