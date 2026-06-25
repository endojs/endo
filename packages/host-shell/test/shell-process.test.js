// In-process tests for the shell-process core, with no daemon: the
// exo-stream byte streams pipeline over eventual-send locally just as
// they would over CapTP.

import '@endo/init/debug.js';

import process from 'node:process';
import test from 'ava';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { makePromiseKit } from '@endo/promise-kit';

import {
  buildChildEnv,
  make,
  makeShellProcess,
  parseArgs,
  parseEnvKeys,
  parsePositiveInteger,
  parseProcessEnv,
  parseStdio,
} from '../src/index.js';
import { readAll } from './_helpers.js';

const textEncoder = new TextEncoder();

/**
 * Spawn a process and register a teardown that SIGKILLs it, so a test
 * that throws (or a long-lived command such as `cat` / `sleep`) never
 * leaks a live subprocess.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {import('../src/types.js').MakeShellProcessOptions} options
 */
const spawnProcess = (t, options) => {
  const proc = makeShellProcess(options);
  t.teardown(() => proc.kill('SIGKILL'));
  return proc;
};

/**
 * Like {@link spawnProcess} but via the formula `make` entry, so the
 * `env`-parsing path is exercised end to end.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {Record<string, string>} env
 */
const makeProcess = (t, env) => {
  const proc = make(undefined, undefined, { env });
  t.teardown(() => proc.kill('SIGKILL'));
  return proc;
};

test('structured argv streams stdout and exit reports success', async t => {
  const proc = spawnProcess(t, { command: 'echo', args: ['hello'] });
  const out = await readAll(proc.stdout());
  t.is(out, 'hello\n');
  t.deepEqual(await proc.exit(), { code: 0, signal: null });
});

test('argument values are not shell-interpreted (no injection)', async t => {
  // Without a shell, the metacharacters are a literal argument to echo,
  // never a second command.
  const proc = spawnProcess(t, {
    command: 'echo',
    args: ['a; touch /tmp/should-not-exist && echo b'],
  });
  const out = await readAll(proc.stdout());
  t.is(out, 'a; touch /tmp/should-not-exist && echo b\n');
});

test('stderr is a separate stream', async t => {
  const proc = spawnProcess(t, {
    command: 'sh',
    args: ['-c', 'echo oops 1>&2'],
  });
  const [out, err] = await Promise.all([
    readAll(proc.stdout()),
    readAll(proc.stderr()),
  ]);
  t.is(out, '');
  t.is(err, 'oops\n');
  t.is((await proc.exit()).code, 0);
});

test('stdin is writable and echoed through to stdout', async t => {
  t.timeout(10_000);
  const proc = spawnProcess(t, { command: 'cat' });
  const writer = iterateBytesWriter(proc.stdin(), { buffer: 64 });
  const collected = readAll(proc.stdout());
  await writer.next(textEncoder.encode('ping-'));
  await writer.next(textEncoder.encode('pong'));
  await writer.return();
  t.is(await collected, 'ping-pong');
  t.is((await proc.exit()).code, 0);
});

test('exit surfaces a non-zero exit code', async t => {
  const proc = spawnProcess(t, { command: 'sh', args: ['-c', 'exit 3'] });
  await readAll(proc.stdout());
  t.deepEqual(await proc.exit(), { code: 3, signal: null });
});

test('shell:true enables pipelines and chaining', async t => {
  const proc = spawnProcess(t, {
    command: 'echo one && echo two | tr a-z A-Z',
    shell: true,
  });
  const out = await readAll(proc.stdout());
  t.is(out, 'one\nTWO\n');
});

test('a shell may not be combined with args', t => {
  // In shell mode Node splices args into the `sh -c` string unquoted, so
  // the combination is refused rather than silently injectable.
  t.throws(
    () =>
      makeShellProcess({ command: 'echo hi', args: ['; echo x'], shell: true }),
    { message: /cannot combine a shell with args/ },
  );
  t.throws(
    () =>
      make(undefined, undefined, {
        env: {
          command: 'echo hi',
          args: JSON.stringify(['; echo x']),
          shell: 'true',
        },
      }),
    { message: /cannot combine a shell with args/ },
  );
});

test('the cwd option is honored', async t => {
  const proc = spawnProcess(t, { command: 'pwd', cwd: '/' });
  const out = await readAll(proc.stdout());
  t.is(out.trim(), '/');
});

test('kill terminates the process and exit reports the signal', async t => {
  t.timeout(10_000);
  const proc = spawnProcess(t, { command: 'sleep', args: ['30'] });
  t.true(proc.kill('SIGKILL'));
  const status = await proc.exit();
  t.is(status.code, null);
  t.is(status.signal, 'SIGKILL');
});

test('captured output is readable after the process exits', async t => {
  t.timeout(10_000);
  // The regression guard for the eager reader: a fast command produces
  // its whole output and exits before a consumer attaches.  Reading
  // stdout *after* exit must still yield the captured bytes; a lazy
  // reader would observe an already-closed, empty pipe here.
  const proc = spawnProcess(t, { command: 'echo', args: ['after-exit'] });
  t.deepEqual(await proc.exit(), { code: 0, signal: null });
  t.is((await readAll(proc.stdout())).trim(), 'after-exit');
});

test('exit resolves without draining every stream', async t => {
  t.timeout(10_000);
  // stderr is produced but never consumed; exit() must still resolve
  // because it tracks process termination, not stdio drainage.
  const proc = spawnProcess(t, {
    command: 'sh',
    args: ['-c', 'echo out; echo err 1>&2'],
  });
  t.is((await proc.exit()).code, 0);
  t.is((await readAll(proc.stdout())).trim(), 'out');
});

test('exit rejects when the command does not exist', async t => {
  t.timeout(10_000);
  const proc = spawnProcess(t, { command: 'definitely-not-a-real-binary-xyz' });
  await t.throwsAsync(proc.exit(), { message: /ENOENT|spawn/ });
});

test('reading stdout after a failed spawn terminates rather than hanging', async t => {
  t.timeout(10_000);
  // The eager reader ends on the stdout stream's 'end'/'error'; a failed
  // spawn must still let a consumer drain stdout to completion instead of
  // hanging forever.  t.timeout guards against a regression to a hang; the
  // stream may legitimately end empty or error, both of which terminate.
  const proc = spawnProcess(t, { command: 'definitely-not-a-real-binary-xyz' });
  try {
    t.is(await readAll(proc.stdout()), '');
  } catch {
    t.pass('stdout terminated via error rather than end');
  }
  await t.throwsAsync(proc.exit());
});

test('large output streams without loss across backpressure', async t => {
  t.timeout(30_000);
  // `seq 20000` is well over a pipe buffer, so it exercises the
  // pause/resume high-water path in the eager reader.
  const proc = spawnProcess(t, { command: 'seq', args: ['20000'] });
  const out = await readAll(proc.stdout());
  const lines = out.trim().split('\n');
  t.is(lines.length, 20_000);
  t.is(lines[lines.length - 1], '20000');
  t.is((await proc.exit()).code, 0);
});

test('stream accessors are memoized', t => {
  const proc = spawnProcess(t, { command: 'cat' });
  t.is(proc.stdout(), proc.stdout());
  t.is(proc.stderr(), proc.stderr());
  t.is(proc.stdin(), proc.stdin());
});

test('command, args, and cwd reject NUL bytes', t => {
  t.throws(() => makeShellProcess({ command: 'echo\0' }), { message: /NUL/ });
  t.throws(() => makeShellProcess({ command: 'echo', args: ['a\0b'] }), {
    message: /NUL/,
  });
  t.throws(() => makeShellProcess({ command: 'echo', cwd: '/tmp\0' }), {
    message: /NUL/,
  });
  // A non-string cwd is rejected at the runtime boundary.
  t.throws(
    () => makeShellProcess({ command: 'echo', cwd: /** @type {any} */ (123) }),
    {
      message: /cwd must be a string/,
    },
  );
});

test('timeoutMs terminates a hanging child', async t => {
  t.timeout(10_000);
  const proc = makeProcess(t, {
    command: 'sleep',
    args: JSON.stringify(['30']),
    timeoutMs: '300',
  });
  t.is((await proc.exit()).signal, 'SIGTERM');
});

test('maxOutputBytes terminates a runaway producer', async t => {
  t.timeout(10_000);
  const proc = makeProcess(t, { command: 'yes', maxOutputBytes: '1000' });
  t.is((await proc.exit()).signal, 'SIGTERM');
});

test('the make entry reads command and args from env', async t => {
  const proc = makeProcess(t, {
    command: 'echo',
    args: JSON.stringify(['via-env']),
  });
  t.is((await readAll(proc.stdout())).trim(), 'via-env');
  t.is((await proc.exit()).code, 0);
});

test('the make entry supports opt-in shell via env', async t => {
  const proc = makeProcess(t, {
    command: 'echo hi | tr a-z A-Z',
    shell: 'true',
  });
  t.is((await readAll(proc.stdout())).trim(), 'HI');
});

test('the make entry rejects a missing command', async t => {
  t.throws(() => make(undefined, undefined, { env: {} }), {
    message: /requires a non-empty "command"/,
  });
});

test('processEnv reaches the child', async t => {
  const proc = makeProcess(t, {
    command: 'printenv',
    args: JSON.stringify(['GREETING']),
    processEnv: JSON.stringify({ GREETING: 'salutations' }),
  });
  t.is((await readAll(proc.stdout())).trim(), 'salutations');
});

test('the child does not inherit non-allowlisted worker env', async t => {
  process.env.HOST_SHELL_SECRET = 'leaked';
  t.teardown(() => {
    delete process.env.HOST_SHELL_SECRET;
  });
  const proc = makeProcess(t, {
    command: 'printenv',
    args: JSON.stringify(['HOST_SHELL_SECRET']),
  });
  // printenv prints nothing and exits non-zero for an unset variable.
  t.is(await readAll(proc.stdout()), '');
  t.is((await proc.exit()).code, 1);
});

test('inheritEnv exposes the full worker environment', async t => {
  process.env.HOST_SHELL_SECRET = 'leaked';
  t.teardown(() => {
    delete process.env.HOST_SHELL_SECRET;
  });
  const proc = makeProcess(t, {
    command: 'printenv',
    args: JSON.stringify(['HOST_SHELL_SECRET']),
    inheritEnv: 'true',
  });
  t.is((await readAll(proc.stdout())).trim(), 'leaked');
});

test('buildChildEnv withholds non-allowlisted vars by default', t => {
  process.env.HOST_SHELL_SECRET = 'leaked';
  t.teardown(() => {
    delete process.env.HOST_SHELL_SECRET;
  });
  const childEnv = buildChildEnv();
  t.false('HOST_SHELL_SECRET' in childEnv);
  t.is(childEnv.PATH, /** @type {string} */ (process.env.PATH));
});

test('buildChildEnv layers processEnv over the base', t => {
  const childEnv = buildChildEnv({
    processEnv: JSON.stringify({ GREETING: 'hi', PATH: '/custom' }),
  });
  t.is(childEnv.GREETING, 'hi');
  t.is(childEnv.PATH, '/custom');
});

test('parseArgs validates a JSON array of strings', t => {
  t.is(parseArgs(undefined), undefined);
  t.deepEqual(parseArgs(JSON.stringify(['a', 'b'])), ['a', 'b']);
  t.throws(() => parseArgs('{not json'), { message: /JSON array/ });
  t.throws(() => parseArgs(JSON.stringify({})), {
    message: /JSON array of strings/,
  });
  t.throws(() => parseArgs(JSON.stringify([1, 2])), {
    message: /JSON array of strings/,
  });
});

test('parseProcessEnv validates a JSON object of strings', t => {
  t.is(parseProcessEnv(undefined), undefined);
  t.deepEqual(parseProcessEnv(JSON.stringify({ A: '1' })), { A: '1' });
  t.throws(() => parseProcessEnv('{not json'), { message: /JSON object/ });
  t.throws(() => parseProcessEnv(JSON.stringify(['a'])), {
    message: /JSON object of string values/,
  });
  t.throws(() => parseProcessEnv(JSON.stringify({ A: 1 })), {
    message: /JSON object of string values/,
  });
});

test('parsePositiveInteger validates positive integers strictly', t => {
  t.is(parsePositiveInteger(undefined, 'timeoutMs'), undefined);
  t.is(parsePositiveInteger('500', 'timeoutMs'), 500);
  t.is(parsePositiveInteger('1000000', 'timeoutMs'), 1_000_000);
  // Rejects zero/negative/decimal/junk, and the lenient forms `Number`
  // would otherwise accept (hex, exponent, whitespace), plus values that
  // would lose precision above Number.MAX_SAFE_INTEGER.
  for (const bad of [
    '0',
    '-5',
    '1.5',
    'abc',
    '',
    '0x10',
    '1e3',
    ' 5 ',
    '9007199254740993',
  ]) {
    t.throws(() => parsePositiveInteger(bad, 'timeoutMs'), {
      message: /positive integer/,
    });
  }
});

test('parseEnvKeys validates a JSON array of strings', t => {
  t.is(parseEnvKeys(undefined), undefined);
  t.deepEqual(parseEnvKeys(JSON.stringify(['A', 'B'])), ['A', 'B']);
  t.throws(() => parseEnvKeys(JSON.stringify('A')), {
    message: /extraEnvKeys.*JSON array of strings/,
  });
  t.throws(() => parseEnvKeys(JSON.stringify([1])), {
    message: /extraEnvKeys.*JSON array of strings/,
  });
});

test('processEnv rejects NUL bytes in keys and values', t => {
  t.throws(() => parseProcessEnv(JSON.stringify({ A: 'a\0b' })), {
    message: /NUL/,
  });
  t.throws(() => parseProcessEnv(JSON.stringify({ 'A\0B': 'x' })), {
    message: /NUL/,
  });
});

test('buildChildEnv passes through extraEnvKeys without full inherit', t => {
  process.env.HOST_SHELL_EXTRA = 'shared';
  t.teardown(() => {
    delete process.env.HOST_SHELL_EXTRA;
  });
  t.is(
    buildChildEnv({ extraEnvKeys: ['HOST_SHELL_EXTRA'] }).HOST_SHELL_EXTRA,
    'shared',
  );
  // Not passed through unless explicitly named.
  t.false('HOST_SHELL_EXTRA' in buildChildEnv());
});

test('extraEnvKeys reaches the child via the make entry', async t => {
  process.env.HOST_SHELL_EXTRA = 'shared';
  t.teardown(() => {
    delete process.env.HOST_SHELL_EXTRA;
  });
  const proc = makeProcess(t, {
    command: 'printenv',
    args: JSON.stringify(['HOST_SHELL_EXTRA']),
    extraEnvKeys: JSON.stringify(['HOST_SHELL_EXTRA']),
  });
  t.is((await readAll(proc.stdout())).trim(), 'shared');
});

test('a SIGTERM-trapping child is escalated to SIGKILL', async t => {
  t.timeout(10_000);
  // The child ignores SIGTERM, so the timeout's SIGTERM has no effect and
  // the killGraceMs escalation must SIGKILL it.  timeoutMs gives the shell
  // ample margin to install its trap first, so the SIGTERM lands on an
  // installed trap rather than racing shell startup.
  const proc = makeProcess(t, {
    command: 'sh',
    args: JSON.stringify(['-c', 'trap "" TERM; while true; do sleep 1; done']),
    timeoutMs: '500',
    killGraceMs: '200',
  });
  t.is((await proc.exit()).signal, 'SIGKILL');
});

test('writing to stdin after the child exits is rejected', async t => {
  t.timeout(10_000);
  const proc = spawnProcess(t, { command: 'sh', args: ['-c', 'exit 0'] });
  await proc.exit();
  const writer = iterateBytesWriter(proc.stdin(), { buffer: 64 });
  await t.throwsAsync(async () => {
    await writer.next(textEncoder.encode('x'));
    await writer.next(textEncoder.encode('y'));
    await writer.return();
  });
});

test('parseStdio validates the disposition', t => {
  t.is(parseStdio(undefined, 'stdout'), 'pipe');
  t.is(parseStdio('pipe', 'stdout'), 'pipe');
  t.is(parseStdio('ignore', 'stdout'), 'ignore');
  t.throws(() => parseStdio('inherit', 'stdout'), {
    message: /must be 'pipe' or 'ignore'/,
  });
});

test("stdout:'ignore' discards output without buffering or blocking", async t => {
  t.timeout(10_000);
  // `seq 100000` is far past the 256 KiB high-water; if stdout were piped
  // and unread it would backpressure and the child could not exit.  With
  // 'ignore' the fd goes to /dev/null, so the child runs to completion and
  // exit() resolves even though nothing drains stdout.
  const proc = spawnProcess(t, {
    command: 'seq',
    args: ['100000'],
    stdout: 'ignore',
  });
  t.is((await proc.exit()).code, 0);
  // The accessor reports that there is nothing to bridge.
  t.throws(() => proc.stdout(), { message: /stdout is not piped/ });
});

test("stdin:'ignore' gives the child an immediate EOF", async t => {
  t.timeout(10_000);
  // `cat` with no stdin pipe reads the null device — immediate EOF — so it
  // exits cleanly instead of waiting forever for input.
  const proc = spawnProcess(t, { command: 'cat', stdin: 'ignore' });
  t.is((await proc.exit()).code, 0);
  t.is(await readAll(proc.stdout()), '');
  t.throws(() => proc.stdin(), { message: /stdin is not piped/ });
});

test("the make entry honors stdout:'ignore'", async t => {
  t.timeout(10_000);
  const proc = makeProcess(t, {
    command: 'seq',
    args: JSON.stringify(['100000']),
    stdout: 'ignore',
  });
  t.is((await proc.exit()).code, 0);
  t.throws(() => proc.stdout(), { message: /stdout is not piped/ });
});

test('the make entry rejects an invalid stdio disposition', t => {
  t.throws(
    () => make(undefined, undefined, { env: { command: 'echo', stdout: 'x' } }),
    { message: /must be 'pipe' or 'ignore'/ },
  );
});

test('context cancellation terminates the child', async t => {
  t.timeout(10_000);
  // A formula's context cancellation is signalled by `whenCancelled()`
  // rejecting; that must SIGTERM the child so it is not orphaned.
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  cancelled.catch(() => {});
  const proc = makeShellProcess({
    command: 'sleep',
    args: ['30'],
    context: { whenCancelled: () => cancelled },
  });
  t.teardown(() => proc.kill('SIGKILL'));
  cancel(new Error('revoked'));
  t.is((await proc.exit()).signal, 'SIGTERM');
});

test('context cancellation escalates to SIGKILL for a trapping child', async t => {
  t.timeout(10_000);
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  cancelled.catch(() => {});
  const proc = makeShellProcess({
    command: 'sh',
    args: ['-c', 'trap "" TERM; echo ready; while true; do sleep 1; done'],
    context: { whenCancelled: () => cancelled },
    killGraceMs: 200,
  });
  t.teardown(() => proc.kill('SIGKILL'));
  // Wait until the child has installed its SIGTERM trap — it prints "ready"
  // on the line right after `trap` — so the cancellation SIGTERM cannot
  // race ahead of the trap and kill the shell outright before it escalates.
  const reader = iterateBytesReader(proc.stdout(), { buffer: 64 });
  await reader.next();
  cancel(new Error('revoked'));
  t.is((await proc.exit()).signal, 'SIGKILL');
});

test('pid() reports the OS process id of a live child', t => {
  const proc = spawnProcess(t, { command: 'cat' });
  const pid = proc.pid();
  t.is(typeof pid, 'number');
  t.true(/** @type {number} */ (pid) > 0);
});

test('pid() is undefined when the command could not be spawned', async t => {
  t.timeout(10_000);
  const proc = spawnProcess(t, { command: 'definitely-not-a-real-binary-xyz' });
  await t.throwsAsync(proc.exit());
  t.is(proc.pid(), undefined);
});

test('kill() defaults to SIGTERM', async t => {
  t.timeout(10_000);
  const proc = spawnProcess(t, { command: 'sleep', args: ['30'] });
  t.true(proc.kill());
  t.is((await proc.exit()).signal, 'SIGTERM');
});

test('kill() returns false once the child has exited', async t => {
  t.timeout(10_000);
  const proc = spawnProcess(t, { command: 'sh', args: ['-c', 'exit 0'] });
  await proc.exit();
  t.false(proc.kill());
});
