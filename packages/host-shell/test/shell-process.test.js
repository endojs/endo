// In-process tests for the shell-process core, with no daemon: the
// exo-stream byte streams pipeline over eventual-send locally just as
// they would over CapTP.

import '@endo/init/debug.js';

import test from 'ava';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import { make, makeShellProcess } from '../src/index.js';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

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
  const proc = makeShellProcess({ command: 'echo', args: ['hello'] });
  const out = await readAll(proc.stdout());
  t.is(out, 'hello\n');
  t.deepEqual(await proc.exit(), { code: 0, signal: null });
});

test('argument values are not shell-interpreted (no injection)', async t => {
  // Without a shell, the metacharacters are a literal argument to echo,
  // never a second command.
  const proc = makeShellProcess({
    command: 'echo',
    args: ['a; touch /tmp/should-not-exist && echo b'],
  });
  const out = await readAll(proc.stdout());
  t.is(out, 'a; touch /tmp/should-not-exist && echo b\n');
});

test('stderr is a separate stream', async t => {
  const proc = makeShellProcess({
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
  const proc = makeShellProcess({ command: 'cat' });
  const writer = iterateBytesWriter(proc.stdin(), { buffer: 64 });
  const collected = readAll(proc.stdout());
  await writer.next(textEncoder.encode('ping-'));
  await writer.next(textEncoder.encode('pong'));
  await writer.return();
  t.is(await collected, 'ping-pong');
  t.is((await proc.exit()).code, 0);
});

test('exit surfaces a non-zero exit code', async t => {
  const proc = makeShellProcess({ command: 'sh', args: ['-c', 'exit 3'] });
  await readAll(proc.stdout());
  t.deepEqual(await proc.exit(), { code: 3, signal: null });
});

test('shell:true enables pipelines and chaining', async t => {
  const proc = makeShellProcess({
    command: 'echo one && echo two | tr a-z A-Z',
    shell: true,
  });
  const out = await readAll(proc.stdout());
  t.is(out, 'one\nTWO\n');
});

test('the cwd option is honored', async t => {
  const proc = makeShellProcess({ command: 'pwd', cwd: '/' });
  const out = await readAll(proc.stdout());
  t.is(out.trim(), '/');
});

test('kill terminates the process and exit reports the signal', async t => {
  const proc = makeShellProcess({ command: 'sleep', args: ['30'] });
  t.true(proc.kill('SIGKILL'));
  const status = await proc.exit();
  t.is(status.code, null);
  t.is(status.signal, 'SIGKILL');
});

test('the make entry reads command and args from env', async t => {
  const proc = make(undefined, undefined, {
    env: { command: 'echo', args: JSON.stringify(['via-env']) },
  });
  t.is((await readAll(proc.stdout())).trim(), 'via-env');
  t.is((await proc.exit()).code, 0);
});

test('the make entry supports opt-in shell via env', async t => {
  const proc = make(undefined, undefined, {
    env: { command: 'echo hi | tr a-z A-Z', shell: 'true' },
  });
  t.is((await readAll(proc.stdout())).trim(), 'HI');
});

test('the make entry rejects a missing command', async t => {
  t.throws(() => make(undefined, undefined, { env: {} }), {
    message: /requires a non-empty "command"/,
  });
});

test('processEnv reaches the child', async t => {
  const proc = make(undefined, undefined, {
    env: {
      command: 'printenv',
      args: JSON.stringify(['GREETING']),
      processEnv: JSON.stringify({ GREETING: 'salutations' }),
    },
  });
  t.is((await readAll(proc.stdout())).trim(), 'salutations');
});
