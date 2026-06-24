// End-to-end: spin a real Endo daemon, load this package as an
// unconfined formula via `make-unconfined`, and drive the returned
// ShellProcess exo's exo-stream stdio across the daemon/worker CapTP
// boundary.
//
// Daemon tests are serial because each forks a full daemon process and
// shares filesystem state under `test/tmp`.

// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import path from 'path';
import url from 'url';
import process from 'process';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { start, stop, purge, makeEndoClient } from '@endo/daemon';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

/** @import { ShellProcess } from '../src/types.js' */

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

const shellModuleHref = url.pathToFileURL(
  path.join(dirname, '..', 'src', 'index.js'),
).href;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

let testCounter = 0;

const makeConfig = () => {
  testCounter += 1;
  const tag = String(testCounter).padStart(4, '0');
  const base = path.join(dirname, 'tmp', tag);
  return {
    statePath: path.join(base, 'state'),
    ephemeralStatePath: path.join(base, 'run'),
    cachePath: path.join(base, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? `\\\\?\\pipe\\endo-host-shell-${tag}.sock`
        : path.join(base, 'endo.sock'),
    address: '127.0.0.1:0',
    pets: new Map(),
    values: new Map(),
  };
};

const prepareHost = async t => {
  const config = makeConfig();
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  cancelled.catch(() => {});

  await purge(config);
  await start(config);
  t.teardown(async () => {
    cancel(new Error('test teardown'));
    await stop(config).catch(() => {});
  });

  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  closed.catch(() => {});

  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  return { host, config };
};

/**
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

test.serial('host-shell formula streams stdout and resolves exit', async t => {
  t.timeout(90_000);
  const { host } = await prepareHost(t);

  const proc = /** @type {ShellProcess} */ (
    await E(host).makeUnconfined('@node', shellModuleHref, {
      powersName: '@none',
      env: { command: 'echo', args: JSON.stringify(['hello-from-formula']) },
      resultName: 'greeter',
    })
  );

  const out = await readAll(E(proc).stdout());
  t.is(out.trim(), 'hello-from-formula');
  t.deepEqual(await E(proc).exit(), { code: 0, signal: null });
});

test.serial('host-shell formula round-trips stdin to stdout', async t => {
  t.timeout(90_000);
  const { host } = await prepareHost(t);

  const proc = /** @type {ShellProcess} */ (
    await E(host).makeUnconfined('@node', shellModuleHref, {
      powersName: '@none',
      env: { command: 'cat' },
      resultName: 'echoer',
    })
  );

  const writer = iterateBytesWriter(E(proc).stdin(), { buffer: 64 });
  const collected = readAll(E(proc).stdout());
  await writer.next(textEncoder.encode('through-'));
  await writer.next(textEncoder.encode('captp'));
  await writer.return();

  t.is(await collected, 'through-captp');
  t.is((await E(proc).exit()).code, 0);
});

test.serial('host-shell formula reports a non-zero exit code', async t => {
  t.timeout(90_000);
  const { host } = await prepareHost(t);

  const proc = /** @type {ShellProcess} */ (
    await E(host).makeUnconfined('@node', shellModuleHref, {
      powersName: '@none',
      env: {
        command: 'echo to-stderr 1>&2; exit 7',
        shell: 'true',
      },
      resultName: 'failer',
    })
  );

  t.is((await readAll(E(proc).stderr())).trim(), 'to-stderr');
  t.is((await E(proc).exit()).code, 7);
});
