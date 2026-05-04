// @ts-check

/**
 * Tests for the {@link makeHostSpawner} default spawner.
 *
 * The host spawner is the engine the `bash` / `exec` / `git` tools
 * use when no explicit override is supplied (i.e. the dev-repl and
 * any other host-only deployment).  These tests pin its observable
 * behaviour — argv resolution against $PATH, async-iterable stdout /
 * stderr surfaces, exit-status reporting, kill plumbing — so the
 * downstream `runProcess` loop in `command.js` can rely on them.
 *
 * The tests run real subprocesses (`/bin/echo`, `/bin/cat`,
 * `/bin/sh`) on the assumption that any POSIX host has a coreutils-
 * style userland available.  Skipped on Windows.
 */

import '@endo/harden';

import process from 'node:process';
import { setTimeout } from 'node:timers';

import test from 'ava';

import { makeHostSpawner } from '../../src/tools/spawner.js';

const isPosix = process.platform !== 'win32';

/**
 * @param {AsyncIterable<Uint8Array> | null | undefined} stream
 */
const drain = async stream => {
  if (stream === null || stream === undefined) return '';
  const decoder = new TextDecoder();
  let acc = '';
  for await (const chunk of stream) {
    acc += decoder.decode(chunk, { stream: true });
  }
  acc += decoder.decode();
  return acc;
};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

test('makeHostSpawner returns a hardened spawner function', t => {
  const spawner = makeHostSpawner();
  t.is(typeof spawner, 'function');
  t.true(Object.isFrozen(spawner));
});

// ---------------------------------------------------------------------------
// Happy-path spawn
// ---------------------------------------------------------------------------

test('host spawner — runs /bin/echo and captures stdout', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const spawner = makeHostSpawner();
  const proc = await spawner(['echo', 'hello world']);
  const [stdout, stderr, status] = await Promise.all([
    drain(proc.stdout),
    drain(proc.stderr),
    proc.wait(),
  ]);
  t.is(stdout.trimEnd(), 'hello world');
  t.is(stderr, '');
  t.is(status.code, 0);
  t.is(status.signal, null);
  t.true(typeof proc.pid === 'number');
});

test('host spawner — propagates a non-zero exit code', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const spawner = makeHostSpawner();
  const proc = await spawner(['sh', '-c', 'exit 7']);
  const status = await proc.wait();
  t.is(status.code, 7);
});

test('host spawner — captures stderr separately from stdout', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const spawner = makeHostSpawner();
  const proc = await spawner(['sh', '-c', 'echo to-out; echo to-err 1>&2']);
  const [stdout, stderr, status] = await Promise.all([
    drain(proc.stdout),
    drain(proc.stderr),
    proc.wait(),
  ]);
  t.is(stdout.trim(), 'to-out');
  t.is(stderr.trim(), 'to-err');
  t.is(status.code, 0);
});

// ---------------------------------------------------------------------------
// PATH resolution
// ---------------------------------------------------------------------------

test('host spawner — throws "command not found" when argv[0] is missing', async t => {
  const spawner = makeHostSpawner({ searchPath: '/nonexistent-dir' });
  await t.throwsAsync(() => spawner(['definitely-not-a-real-binary']), {
    message: /command not found/,
  });
});

test('host spawner — rejects empty argv', async t => {
  const spawner = makeHostSpawner();
  await t.throwsAsync(() => spawner([]), {
    message: /non-empty/,
  });
});

// ---------------------------------------------------------------------------
// Kill plumbing
// ---------------------------------------------------------------------------

test('host spawner — kill() terminates the process and wait() resolves', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const spawner = makeHostSpawner();
  // `cat` with no stdin source blocks until killed.
  const proc = await spawner(['sh', '-c', 'sleep 30']);
  setTimeout(() => {
    void proc.kill('SIGTERM');
  }, 50);
  const status = await proc.wait();
  // SIGTERM either delivers as a signal or as exit code 143 depending
  // on whether the shell traps it.
  t.true(status.signal === 'SIGTERM' || status.code !== 0);
});

// ---------------------------------------------------------------------------
// Shell mode
// ---------------------------------------------------------------------------

test('host spawner — shell:true runs argv through /bin/sh', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const spawner = makeHostSpawner();
  // Globbing requires a shell to expand the wildcard.  We don't care
  // about the matches — we care that a builtin like `echo` works
  // through shell mode.
  const proc = await spawner(['echo', 'one', 'two'], { shell: true });
  const stdout = await drain(proc.stdout);
  await proc.wait();
  t.is(stdout.trim(), 'one two');
});
