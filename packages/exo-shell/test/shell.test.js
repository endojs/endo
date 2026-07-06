// @ts-check
/* global process */

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { makeHostSpawner } from '@endo/host-spawner';

import { makeShell } from '../src/shell.js';

/**
 * A fully controllable in-memory {@link Spawner}.  Each spawn records the argv
 * and opts it was handed and returns a {@link ProcessLike} whose stdout / stderr
 * / exit are scripted by `plan`.  Nothing touches the OS, so allowlist / argv /
 * env / output-cap / timeout behaviour is exercised deterministically.
 *
 * @param {(argv: string[], opts: object) => {
 *   stdout?: Uint8Array[],
 *   stderr?: Uint8Array[],
 *   code?: number | null,
 *   signal?: string | null,
 *   hang?: boolean,
 * }} plan
 */
const makeFakeSpawner = plan => {
  /** @type {{ argv: string[], opts: object }[]} */
  const calls = [];
  /** @type {import('@endo/host-spawner').Spawner} */
  const spawner = async (argv, opts = {}) => {
    calls.push({ argv: [...argv], opts });
    const script = plan(argv, opts);
    const toStream = chunks =>
      chunks === undefined
        ? null
        : {
            async *[Symbol.asyncIterator]() {
              for (const c of chunks) yield c;
            },
          };
    let killSignal = null;
    const killed = {
      /** @type {(v: { code: number|null, signal: string|null }) => void} */
      resolve: () => {},
    };
    const exited = script.hang
      ? new Promise(resolve => {
          killed.resolve = resolve;
        })
      : Promise.resolve({
          code: script.code ?? 0,
          signal: script.signal ?? null,
        });
    return harden({
      pid: 1234,
      stdout: toStream(script.stdout),
      stderr: toStream(script.stderr),
      wait: () => exited,
      kill: async signal => {
        killSignal = signal == null ? 'SIGTERM' : String(signal);
        // A hanging process resolves its exit when killed.
        killed.resolve({ code: null, signal: killSignal });
      },
    });
  };
  return { spawner: harden(spawner), calls };
};

const bytes = s => new TextEncoder().encode(s);

const basePolicy = harden({
  allowedCommands: ['echo', 'node'],
  timeoutMs: 1000,
  maxOutputBytes: 1024,
  env: { CI: 'true' },
});

test('exec rejects a command outside the allowlist before spawning', async t => {
  const { spawner, calls } = makeFakeSpawner(() => ({ stdout: [bytes('x')] }));
  const shell = makeShell({ cwd: '/repo', policy: basePolicy, spawner });
  await t.throwsAsync(() => shell.exec('rm', ['-rf', '/']), {
    message: /not in the allowlist/,
  });
  t.is(calls.length, 0, 'no child was spawned for a rejected command');
});

test('exec passes an argv array (no shell string) and the cwd/env', async t => {
  const { spawner, calls } = makeFakeSpawner(() => ({ stdout: [bytes('ok')] }));
  const shell = makeShell({ cwd: '/repo', policy: basePolicy, spawner });
  const result = await shell.exec('echo', ['hello', 'world']);
  t.is(result.stdout, 'ok');
  t.is(result.exitCode, 0);
  t.deepEqual(calls[0].argv, ['echo', 'hello', 'world']);
  t.is(calls[0].opts.cwd, '/repo');
  t.is(
    calls[0].opts.shell,
    false,
    'shell mode is never enabled on this surface',
  );
  t.deepEqual(calls[0].opts.env, { CI: 'true' });
});

test('a non-zero exit is returned as data, not thrown', async t => {
  const { spawner } = makeFakeSpawner(() => ({
    stdout: [bytes('')],
    stderr: [bytes('nope')],
    code: 3,
  }));
  const shell = makeShell({ cwd: '/repo', policy: basePolicy, spawner });
  const result = await shell.exec('node', ['-e', 'process.exit(3)']);
  t.is(result.exitCode, 3);
  t.is(result.stderr, 'nope');
  t.false(result.truncated);
});

test('stdout beyond maxOutputBytes is truncated and flagged', async t => {
  const { spawner } = makeFakeSpawner(() => ({
    stdout: [bytes('a'.repeat(50)), bytes('b'.repeat(50))],
  }));
  const shell = makeShell({
    cwd: '/repo',
    policy: harden({ ...basePolicy, maxOutputBytes: 10 }),
    spawner,
  });
  const result = await shell.exec('echo', ['big']);
  t.is(result.stdout.length, 10);
  t.is(result.stdout, 'a'.repeat(10));
  t.true(result.truncated);
});

test('a hanging process is killed at the timeout and reports the signal', async t => {
  const { spawner } = makeFakeSpawner(() => ({ hang: true }));
  const shell = makeShell({
    cwd: '/repo',
    policy: harden({ ...basePolicy, timeoutMs: 50 }),
    spawner,
  });
  const result = await shell.exec('node', ['-e', 'while(true){}']);
  t.is(result.exitCode, null);
  t.is(result.signal, 'SIGTERM');
});

test('a per-call timeout may only narrow the policy, never widen it', async t => {
  const { spawner } = makeFakeSpawner(() => ({ hang: true }));
  const shell = makeShell({
    cwd: '/repo',
    policy: harden({ ...basePolicy, timeoutMs: 40 }),
    spawner,
  });
  // A widening request (10_000) is ignored — the policy's 40ms still fires.
  const start = Date.now();
  const result = await shell.exec('node', ['-e', '1'], { timeoutMs: 10_000 });
  const elapsedMs = Date.now() - start;
  t.is(result.signal, 'SIGTERM');
  t.true(elapsedMs < 5000, 'the widening per-call timeout did not take effect');
});

test('inspect reveals the policy bounds but no host path (cwd/env/searchPath)', async t => {
  const { spawner } = makeFakeSpawner(() => ({ stdout: [] }));
  const shell = makeShell({
    cwd: '/very/secret/host/path',
    policy: harden({
      allowedCommands: ['echo'],
      timeoutMs: 1000,
      maxOutputBytes: 2048,
      env: { SECRET_TOKEN: 'do-not-leak' },
      searchPath: '/home/user/.local/bin:/usr/bin',
    }),
    spawner,
  });
  const revealed = await shell.inspect();
  t.deepEqual(revealed, {
    allowedCommands: ['echo'],
    timeoutMs: 1000,
    maxOutputBytes: 2048,
  });
  const serialized = JSON.stringify(revealed);
  t.false(serialized.includes('secret'), 'cwd path did not leak');
  t.false(serialized.includes('do-not-leak'), 'env value did not leak');
  t.false(serialized.includes('.local'), 'searchPath did not leak');
});

test('a read-only mount is refused: a shell that cannot mutate is not a shell', t => {
  const { spawner } = makeFakeSpawner(() => ({ stdout: [] }));
  t.throws(
    () =>
      makeShell({ cwd: '/repo', policy: basePolicy, spawner, readOnly: true }),
    { message: /read-only mount/ },
  );
});

// --- integration: real host spawner proves env sanitization end-to-end ------

test('host engine: the child sees only the policy env, never the host process env', async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'exo-shell-'));
  t.teardown(() => fs.promises.rm(root, { recursive: true, force: true }));

  // A secret in the *host* process env must not reach the child.
  process.env.EXO_SHELL_HOST_SECRET = 'leaked';
  t.teardown(() => {
    delete process.env.EXO_SHELL_HOST_SECRET;
  });

  const searchPath = process.env.PATH || '/usr/bin:/bin';
  const spawner = makeHostSpawner({
    searchPath,
    defaultEnv: { PATH: searchPath, LC_ALL: 'C' },
  });
  const shell = makeShell({
    cwd: root,
    policy: harden({
      allowedCommands: ['printenv', 'pwd'],
      timeoutMs: 10_000,
      maxOutputBytes: 65_536,
      env: { PASSED_THROUGH: 'yes' },
      searchPath,
    }),
    spawner,
  });

  // The passlisted var is present.
  const passed = await shell.exec('printenv', ['PASSED_THROUGH']);
  t.is(passed.stdout.trim(), 'yes');
  t.is(passed.exitCode, 0);

  // The host secret is absent → printenv exits non-zero with empty stdout.
  const secret = await shell.exec('printenv', ['EXO_SHELL_HOST_SECRET']);
  t.is(secret.stdout.trim(), '');
  t.not(secret.exitCode, 0);

  // cwd is the mount directory.
  const cwd = await shell.exec('pwd', []);
  t.is(cwd.stdout.trim(), fs.realpathSync(root));
});
