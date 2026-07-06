// @ts-check
/// <reference types="ses"/>

import test from '@endo/ses-ava/prepare-endo.js';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { makeShell } from '@endo/exo-shell';
import { makeHostSpawner } from '@endo/host-spawner';

import { makeFilePowers } from '../src/daemon-node-powers.js';
import { getMountBacking, makeMount } from '../src/mount.js';

/**
 * Provision a real on-disk mount, mirroring `git.test.js`.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {{ readOnly?: boolean }} [opts]
 */
const provisionMount = async (t, { readOnly = false } = {}) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'shell-test-'));
  t.teardown(() => fs.promises.rm(root, { recursive: true, force: true }));
  const filePowers = makeFilePowers({ fs, path });
  return { root, mount: makeMount({ rootPath: root, readOnly, filePowers }) };
};

/**
 * Assemble a Shell exactly as the daemon `shell` formula maker does: reject a
 * read-only mount, resolve cwd from the mount backing, and drive execution
 * through the host spawner with a sanitized base env.  This exercises the
 * maker's composition without booting a full daemon (which needs a native
 * sqlite build unavailable in some CI sandboxes).
 *
 * @param {object} mount
 * @param {import('@endo/exo-shell').ShellPolicy} policy
 */
const makeShellLikeFormulaMaker = (mount, policy) => {
  const backing = getMountBacking(mount);
  if (!backing) throw new Error('not a daemon-minted mount');
  if (backing.kind !== 'physical') throw new Error('not a physical mount');
  if (backing.readOnly) {
    throw new Error(
      'Shell requires a writable mount; refusing a read-only mount',
    );
  }
  const searchPath = policy.searchPath || process.env.PATH || '';
  const baseEnv = harden({ PATH: searchPath, LC_ALL: 'C' });
  const spawner = makeHostSpawner({ searchPath, defaultEnv: baseEnv });
  return makeShell({
    cwd: backing.currentDir,
    policy: harden({
      allowedCommands: harden([...policy.allowedCommands]),
      timeoutMs: policy.timeoutMs,
      maxOutputBytes: policy.maxOutputBytes,
      env: harden({ ...(policy.env || {}) }),
    }),
    spawner,
  });
};

const basePolicy = harden({
  allowedCommands: ['printenv', 'pwd', 'printf'],
  timeoutMs: 10_000,
  maxOutputBytes: 65_536,
  env: { CI: 'true' },
});

test('provideShell composition: exec runs an allowlisted command in the mount cwd', async t => {
  const { root, mount } = await provisionMount(t);
  const shell = makeShellLikeFormulaMaker(mount, basePolicy);

  const pwd = await shell.exec('pwd', []);
  t.is(pwd.exitCode, 0);
  t.is(pwd.stdout.trim(), fs.realpathSync(root));

  const printf = await shell.exec('printf', ['%s', 'hello']);
  t.is(printf.stdout, 'hello');
  t.is(printf.exitCode, 0);
});

test('provideShell composition: a command off the allowlist is refused', async t => {
  const { mount } = await provisionMount(t);
  const shell = makeShellLikeFormulaMaker(mount, basePolicy);
  await t.throwsAsync(() => shell.exec('rm', ['-rf', '.']), {
    message: /not in the allowlist/,
  });
});

test('provideShell composition: the child sees only the policy env, never host env', async t => {
  const { mount } = await provisionMount(t);
  process.env.SHELL_TEST_HOST_SECRET = 'leaked';
  t.teardown(() => {
    delete process.env.SHELL_TEST_HOST_SECRET;
  });
  const shell = makeShellLikeFormulaMaker(
    mount,
    harden({ ...basePolicy, env: { PASSED: 'ok' } }),
  );

  const passed = await shell.exec('printenv', ['PASSED']);
  t.is(passed.stdout.trim(), 'ok');

  const secret = await shell.exec('printenv', ['SHELL_TEST_HOST_SECRET']);
  t.is(secret.stdout.trim(), '');
  t.not(secret.exitCode, 0);
});

test('provideShell composition: a read-only mount is refused (writable-only)', async t => {
  const { mount } = await provisionMount(t, { readOnly: true });
  t.throws(() => makeShellLikeFormulaMaker(mount, basePolicy), {
    message: /read-only mount/,
  });
});

test('provideShell composition: inspect reveals policy bounds but no host path', async t => {
  const { root, mount } = await provisionMount(t);
  const shell = makeShellLikeFormulaMaker(mount, basePolicy);
  const revealed = await shell.inspect();
  t.deepEqual(revealed, {
    allowedCommands: ['printenv', 'pwd', 'printf'],
    timeoutMs: 10_000,
    maxOutputBytes: 65_536,
  });
  t.false(JSON.stringify(revealed).includes(root), 'the mount path did not leak');
});
