// In-process tests for the shell-process core, with no daemon: the
// exo-stream byte streams pipeline over eventual-send locally just as
// they would over CapTP.

import '@endo/init/debug.js';

import process from 'node:process';
import test from 'ava';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import {
  buildChildEnv,
  make,
  makeShellProcess,
  parseArgs,
  parsePositiveInteger,
  parseProcessEnv,
} from '../src/index.js';

const textDecoder = new TextDecoder();
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

/**
 * Drain an exo-stream byte reader to a single UTF-8 string.
 *
 * @param {any} readerRef
 * @returns {Promise<string>}
 */
const readAll = async readerRef => {
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(readerRef, { buffer: 64 })) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return textDecoder.decode(out);
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

test('parsePositiveInteger validates positive integers', t => {
  t.is(parsePositiveInteger(undefined, 'timeoutMs'), undefined);
  t.is(parsePositiveInteger('500', 'timeoutMs'), 500);
  for (const bad of ['0', '-5', '1.5', 'abc', '']) {
    t.throws(() => parsePositiveInteger(bad, 'timeoutMs'), {
      message: /positive integer/,
    });
  }
});
