// @ts-check

/**
 * Tests for the {@link makeSandboxSpawner} slice-backed spawner adapter.
 *
 * The adapter wraps a `SandboxHandle` so the `bash` / `exec` / `git`
 * command tools can spawn through `E(handle).spawn(argv, opts)` instead
 * of `child_process.spawn`.  These tests pin its observable behaviour:
 *
 *   - argv / opts forwarded to `SandboxHandle.spawn` verbatim,
 *   - `shell: true` rewritten to an explicit `['/bin/sh', '-c', ...]`
 *     invocation inside the slice,
 *   - pid eagerly resolved so the returned `ProcessLike` matches the
 *     host spawner's sync-pid contract,
 *   - `ReaderRef`-shaped stdout / stderr bridged into the
 *     `AsyncIterable<Uint8Array>` surface `runProcess` drains,
 *   - `wait` / `kill` plumbing forwarded eventually.
 *
 * The integration test at the bottom drives the spawner through
 * `makeCommandTool`'s timeout / kill loop with a process stub that
 * never exits, verifying the supervision loop kills the slice process
 * and surfaces the timeout error end-to-end.
 *
 * Tests use a hand-rolled `SandboxHandle` stub rather than spinning up
 * a real `@endo/sandbox` slice — bwrap-backed integration is covered
 * by `packages/sandbox`'s own test suite, and would force this file
 * to skip on hosts without bwrap.
 */

import '@endo/init/debug.js';

import test from 'ava';

import { makeCommandTool } from '../../src/tools/command.js';
import { makeSandboxSpawner } from '../../src/tools/sandbox-spawner.js';

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

/**
 * Build a stub `ReaderRef` exo that yields the provided byte chunks
 * one `next()` call at a time, then signals `done`.
 *
 * @param {Uint8Array[]} chunks
 */
const makeReaderRefStub = chunks => {
  let i = 0;
  return harden({
    async next() {
      if (i >= chunks.length) {
        return harden({ done: true, value: undefined });
      }
      const value = chunks[i];
      i += 1;
      return harden({ done: false, value });
    },
  });
};

/**
 * Build a stub `ProcessHandle` whose stdio returns reader-ref stubs
 * with the supplied chunks, and whose `wait` / `kill` are observable.
 *
 * Pass `waitNever: true` to make the process appear to hang
 * indefinitely until `kill` is invoked — the supervision loop in
 * `runProcess` should then time out and reap it.
 *
 * @param {object} [opts]
 * @param {number} [opts.pid]
 * @param {Uint8Array[]} [opts.stdoutChunks]
 * @param {Uint8Array[]} [opts.stderrChunks]
 * @param {{ code: number | null; signal: string | null }} [opts.exitStatus]
 * @param {boolean} [opts.waitNever]
 */
const makeProcessHandleStub = ({
  pid = 4242,
  stdoutChunks = [],
  stderrChunks = [],
  exitStatus = { code: 0, signal: null },
  waitNever = false,
} = {}) => {
  const stdoutRef = makeReaderRefStub(stdoutChunks);
  const stderrRef = makeReaderRefStub(stderrChunks);

  const killCalls = [];

  /** @type {(value: { code: number | null; signal: string | null }) => void} */
  let resolveWait = () => {};
  const waitPromise = waitNever
    ? new Promise(r => {
        resolveWait = r;
      })
    : Promise.resolve(harden({ ...exitStatus }));

  const handle = harden({
    pid: () => pid,
    stdout: () => stdoutRef,
    stderr: () => stderrRef,
    wait: () => waitPromise,
    /** @param {string | number} [signal] */
    kill: async signal => {
      killCalls.push(signal);
      // When the process is "hanging", honour the kill by resolving
      // wait with a signal status so the supervision loop reaps it.
      if (waitNever) {
        resolveWait(harden({ code: null, signal: 'SIGTERM' }));
      }
    },
  });

  // Outer wrapper deliberately unhardened so `killCalls` stays mutable
  // for the test to inspect.
  return { handle, killCalls };
};

/**
 * Build a stub `SandboxHandle` that records every `spawn` call and
 * returns the supplied process stub.
 *
 * @param {ReturnType<typeof makeProcessHandleStub>['handle']} processHandle
 */
const makeSandboxHandleStub = processHandle => {
  /** @type {Array<{ argv: string[]; opts: any }>} */
  const calls = [];
  const handle = harden({
    /**
     * @param {string[]} argv
     * @param {any} opts
     */
    spawn: async (argv, opts) => {
      calls.push({ argv: [...argv], opts: { ...opts } });
      return processHandle;
    },
  });
  // Intentionally not hardening the outer wrapper so the test can keep
  // pushing into `calls`.  The handle itself is hardened above.
  return { handle, calls };
};

const enc = (/** @type {string} */ s) => new TextEncoder().encode(s);

/**
 * Drain an `AsyncIterable<Uint8Array>` into a UTF-8 string.
 *
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

test('makeSandboxSpawner returns a hardened spawner function', t => {
  const { handle } = makeSandboxHandleStub(makeProcessHandleStub().handle);
  const spawner = makeSandboxSpawner({ handle });
  t.is(typeof spawner, 'function');
  t.true(Object.isFrozen(spawner));
});

test('makeSandboxSpawner rejects a missing handle', t => {
  t.throws(
    () =>
      makeSandboxSpawner(
        // @ts-expect-error — exercising the runtime guard
        {},
      ),
    {
      message: /handle is required/,
    },
  );
});

test('sandbox spawner — rejects empty argv', async t => {
  const { handle } = makeSandboxHandleStub(makeProcessHandleStub().handle);
  const spawner = makeSandboxSpawner({ handle });
  await t.throwsAsync(() => spawner([]), {
    message: /non-empty/,
  });
});

// ---------------------------------------------------------------------------
// Argv / opts forwarding
// ---------------------------------------------------------------------------

test('sandbox spawner — forwards argv verbatim and sets capture flags', async t => {
  const proc = makeProcessHandleStub();
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });

  await spawner(['echo', 'hi']);

  t.is(sandbox.calls.length, 1);
  t.deepEqual([...sandbox.calls[0].argv], ['echo', 'hi']);
  t.true(sandbox.calls[0].opts.captureStdout);
  t.true(sandbox.calls[0].opts.captureStderr);
  // No cwd / env supplied → spawner does not synthesise either.
  t.is(sandbox.calls[0].opts.cwd, undefined);
  t.is(sandbox.calls[0].opts.env, undefined);
});

test('sandbox spawner — forwards cwd and env', async t => {
  const proc = makeProcessHandleStub();
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });

  await spawner(['ls'], {
    cwd: '/work',
    env: { FOO: 'bar' },
  });

  t.is(sandbox.calls[0].opts.cwd, '/work');
  t.deepEqual({ ...sandbox.calls[0].opts.env }, { FOO: 'bar' });
});

test('sandbox spawner — shell:true rewrites argv to /bin/sh -c', async t => {
  const proc = makeProcessHandleStub();
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });

  await spawner(['echo', 'hello world'], { shell: true });

  t.deepEqual(
    [...sandbox.calls[0].argv],
    ['/bin/sh', '-c', 'echo hello world'],
  );
});

// ---------------------------------------------------------------------------
// Pid resolution
// ---------------------------------------------------------------------------

test('sandbox spawner — eagerly resolves pid', async t => {
  const proc = makeProcessHandleStub({ pid: 1234 });
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });

  const handle = await spawner(['true']);
  t.is(handle.pid, 1234);
});

test('sandbox spawner — falls back to pid 0 when the slice rejects pid()', async t => {
  // Build a handle whose pid() throws — emulates a stub / lightweight
  // process exo that does not surface a pid.
  const stdoutRef = makeReaderRefStub([]);
  const stderrRef = makeReaderRefStub([]);
  const procHandle = harden({
    pid: () => {
      throw new Error('not implemented');
    },
    stdout: () => stdoutRef,
    stderr: () => stderrRef,
    wait: async () => harden({ code: 0, signal: null }),
    kill: async () => {},
  });
  const sandbox = makeSandboxHandleStub(procHandle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });

  const handle = await spawner(['true']);
  t.is(handle.pid, 0);
});

// ---------------------------------------------------------------------------
// Stdio bridging
// ---------------------------------------------------------------------------

test('sandbox spawner — bridges stdout ReaderRef into an AsyncIterable', async t => {
  const proc = makeProcessHandleStub({
    stdoutChunks: [enc('hello '), enc('world')],
  });
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });

  const handle = await spawner(['echo']);
  t.is(await drain(handle.stdout), 'hello world');
});

test('sandbox spawner — bridges stderr ReaderRef into an AsyncIterable', async t => {
  const proc = makeProcessHandleStub({
    stderrChunks: [enc('oops\n')],
  });
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });

  const handle = await spawner(['echo']);
  t.is(await drain(handle.stderr), 'oops\n');
});

// ---------------------------------------------------------------------------
// wait / kill plumbing
// ---------------------------------------------------------------------------

test('sandbox spawner — wait() forwards exit status', async t => {
  const proc = makeProcessHandleStub({
    exitStatus: { code: 7, signal: null },
  });
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });

  const handle = await spawner(['fail']);
  const status = await handle.wait();
  t.is(status.code, 7);
  t.is(status.signal, null);
});

test('sandbox spawner — kill() reaches the slice ProcessHandle', async t => {
  const proc = makeProcessHandleStub();
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });

  const handle = await spawner(['sleep']);
  await handle.kill('SIGKILL');
  t.deepEqual(proc.killCalls, ['SIGKILL']);
});

// ---------------------------------------------------------------------------
// End-to-end via makeCommandTool — verifies the timeout / kill loop
// in runProcess fires correctly through a sandbox spawner.
// ---------------------------------------------------------------------------

test('makeCommandTool + sandbox spawner — happy path drains stdout', async t => {
  const proc = makeProcessHandleStub({
    stdoutChunks: [enc('ok\n')],
    exitStatus: { code: 0, signal: null },
  });
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });
  const tool = makeCommandTool({ name: 'sandboxed', spawner });

  const result = await tool.execute({ args: ['echo', 'ok'] });
  t.is(result.success, true);
  t.is(result.stdout, 'ok');
  t.is(result.exitCode, 0);
  // Confirms the spawner was actually invoked through the tool.
  t.is(sandbox.calls.length, 1);
  t.deepEqual([...sandbox.calls[0].argv], ['echo', 'ok']);
});

test('makeCommandTool + sandbox spawner — timeout fires kill on a hung process', async t => {
  const proc = makeProcessHandleStub({ waitNever: true });
  const sandbox = makeSandboxHandleStub(proc.handle);
  const spawner = makeSandboxSpawner({ handle: sandbox.handle });
  const tool = makeCommandTool({ name: 'sandboxed', spawner });

  await t.throwsAsync(() => tool.execute({ args: ['hang'], timeout_ms: 50 }), {
    message: /timed out after 50ms/,
  });
  // Supervision loop must have called kill on the slice process.
  t.true(proc.killCalls.length >= 1);
  t.is(proc.killCalls[0], 'SIGTERM');
});
