// @ts-nocheck
/**
 * Live RPC interop with the reference Cap'n Proto C++ implementation.
 *
 * Spawns the C++ Echo server (test/interop-rpc/echo-server, built via
 * test/interop-rpc/build.sh) listening on an ephemeral TCP port, connects
 * to it from Node using `connectTcp`, and exercises the `Echo` interface
 * defined in test/interop-rpc/echo.capnp. Both peers compile from the
 * SAME schema file (capnp on the C++ side, loadSchema on the Node side),
 * so a successful round-trip proves byte-level wire-format compatibility
 * AND protocol-level (Bootstrap / Call / Return / Finish) compatibility
 * with the reference implementation.
 *
 * Skipped if either:
 *   - the `capnp` CLI is not on PATH (no schema compiler), or
 *   - the C++ binary hasn't been built (build.sh must be run first; the
 *     CI workflow runs it explicitly before invoking the test).
 */

import test from '@endo/ses-ava/test.js';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  E,
  loadSchema,
  makeInterfaceRegistry,
  connectTcp,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'interop-rpc');
const SERVER_BIN = join(FIXTURE_DIR, 'echo-server');
const SCHEMA_PATH = join(FIXTURE_DIR, 'echo.capnp');

const haveCapnp = (() => {
  const r = spawnSync('capnp', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
})();
const haveServerBin = existsSync(SERVER_BIN);

if (!haveCapnp || !haveServerBin) {
  test('SKIP: capnp + echo-server fixture required for live RPC interop', t => {
    t.pass(
      `install capnproto and run test/interop-rpc/build.sh; ` +
        `capnp=${haveCapnp}, echo-server=${haveServerBin}`,
    );
  });
} else {
  /**
   * Spawn the C++ echo-server, wait for its `listening on port N\n` line,
   * and return the port plus a `kill()` helper.
   */
  const startEchoServer = async () => {
    const child = spawn(SERVER_BIN, ['127.0.0.1:0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    /** @type {string} */
    let stderrAccumulated = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', s => {
      stderrAccumulated += s;
    });
    /** @type {Promise<number>} */
    const portReady = new Promise((resolve, reject) => {
      let stdoutBuffered = '';
      const onData = chunk => {
        stdoutBuffered += chunk.toString('utf8');
        const m = /listening on port (\d+)/.exec(stdoutBuffered);
        if (m) {
          child.stdout.off('data', onData);
          resolve(Number(m[1]));
        }
      };
      child.stdout.on('data', onData);
      child.once('exit', code => {
        reject(
          Error(
            `echo-server exited (${code}) before listening; stderr:\n${stderrAccumulated}`,
          ),
        );
      });
    });
    const port = await portReady;
    return {
      port,
      kill: () => {
        if (!child.killed) child.kill('SIGTERM');
      },
    };
  };

  test('Node ⇄ C++: ping/pong over TCP via connectTcp + EzRpcServer', async t => {
    const schemaText = readFileSync(SCHEMA_PATH, 'utf8');
    const interfaceRegistry = makeInterfaceRegistry();
    loadSchema(schemaText).registerInterface(interfaceRegistry, 'Echo');

    const server = await startEchoServer();
    try {
      const client = await connectTcp({
        host: '127.0.0.1',
        port: server.port,
        interfaceRegistry,
      });

      try {
        const echo = client.capnp.getBootstrap();
        const a = await E(echo).ping({ msg: 'hello from node' });
        t.is(a.reply, 'pong: hello from node');

        const b = await E(echo).count({ n: 21 });
        t.is(b.twiceN, 42);

        // Pipelined burst — exercises wire chunking and the streaming parser.
        const ps = [];
        for (let i = 0; i < 32; i += 1) ps.push(E(echo).count({ n: i }));
        const results = await Promise.all(ps);
        for (let i = 0; i < 32; i += 1) t.is(results[i].twiceN, i * 2);
      } finally {
        client.close();
      }
    } finally {
      server.kill();
    }
  });
}
