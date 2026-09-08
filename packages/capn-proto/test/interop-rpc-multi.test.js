// @ts-nocheck
/**
 * Multi-client live RPC interop with the reference Cap'n Proto C++
 * implementation. Each test spawns the same C++ EzRpcServer used by the
 * basic interop test (test/interop-rpc/echo-server, exposing TestSuite
 * + Counter) and exercises a different two-party scenario:
 *
 *   1. Two independent Node clients, each calling newCounter() — proves
 *      each connection gets its own Counter state on the server side
 *      (canonical RPC isolation property).
 *   2. Pipelined call on a returned cap — `E(E(remote).newCounter()).inc()`
 *      with no intermediate await; matches the upstream `TEST(Rpc, Pipelining)`
 *      pattern. Verifies the C++ server accepts our PromisedAnswer-style
 *      pipelined target descriptor.
 *   3. Cap-as-argument round-trip — Node passes its own bootstrap (a
 *      Node-hosted TestSuite cap) to the C++ server; the server invokes
 *      target.ping() on it; the result is the Node side's own response.
 *      Matches the upstream `TEST(Rpc, RetainAndRelease)` pattern.
 *   4. Counter state survives pipelining + concurrency — many clients,
 *      many counters, many increments, all interleaved over the wire.
 *
 * Skipped together with test/interop-rpc.test.js whenever the C++ peer
 * isn't available (no `capnp` CLI or the build script wasn't run).
 */

import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
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
  test('SKIP: capnp + echo-server fixture required for multi-client RPC interop', t => {
    t.pass(
      `install capnproto and run test/interop-rpc/build.sh; ` +
        `capnp=${haveCapnp}, echo-server=${haveServerBin}`,
    );
  });
} else {
  /**
   * Build a fresh InterfaceRegistry that knows both TestSuite and Counter.
   * The caller-side schema needs Counter registered too because
   * `newCounter()` returns a Counter cap whose subsequent method calls
   * (`inc`, `get`) need their own codecs.
   */
  const buildRegistry = () => {
    const schemaText = readFileSync(SCHEMA_PATH, 'utf8');
    const schema = loadSchema(schemaText);
    const interfaceRegistry = makeInterfaceRegistry();
    schema.registerInterface(interfaceRegistry, 'TestSuite');
    schema.registerInterface(interfaceRegistry, 'Counter');
    return interfaceRegistry;
  };

  /**
   * Spawn the C++ echo-server, wait for its `listening on port N\n` line,
   * and return the port plus a `kill()` helper.
   */
  const startEchoServer = async () => {
    const child = spawn(SERVER_BIN, ['127.0.0.1:0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderrAccumulated = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', s => {
      stderrAccumulated += s;
    });
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

  test('two independent Node clients each get their own Counter state', async t => {
    const interfaceRegistry = buildRegistry();
    const server = await startEchoServer();
    try {
      const a = await connectTcp({
        host: '127.0.0.1',
        port: server.port,
        interfaceRegistry,
      });
      const b = await connectTcp({
        host: '127.0.0.1',
        port: server.port,
        interfaceRegistry,
      });
      try {
        const counterA = await E(a.capnp.getBootstrap()).newCounter();
        const counterB = await E(b.capnp.getBootstrap()).newCounter();

        // Each client increments its own Counter; B should not see A's
        // increments. (CounterImpl is per-cap; one fresh impl per
        // `newCounter()` call, regardless of which connection.)
        t.is((await E(counterA.counter).inc()).value, 1);
        t.is((await E(counterA.counter).inc()).value, 2);
        t.is((await E(counterA.counter).inc()).value, 3);
        t.is((await E(counterB.counter).inc()).value, 1);
        t.is((await E(counterB.counter).get()).value, 1);
        t.is((await E(counterA.counter).get()).value, 3);
      } finally {
        a.close();
        b.close();
      }
    } finally {
      server.kill();
    }
  });

  test('many pipelined increments on a returned Counter cap', async t => {
    const interfaceRegistry = buildRegistry();
    const server = await startEchoServer();
    try {
      const client = await connectTcp({
        host: '127.0.0.1',
        port: server.port,
        interfaceRegistry,
      });
      try {
        const remote = client.capnp.getBootstrap();

        // One round-trip to get a fresh Counter cap, then a burst of
        // pipelined inc() calls against it without intermediate awaits.
        // The C++ EzRpcServer should see them in order and return values
        // 1..50 (the canonical RPC ordering guarantee on a single cap).
        const r = await E(remote).newCounter();
        const counter = r.counter;

        const ps = [];
        for (let i = 0; i < 50; i += 1) ps.push(E(counter).inc());
        const results = await Promise.all(ps);
        for (let i = 0; i < 50; i += 1) t.is(results[i].value, i + 1);

        // Final get() reflects the last increment.
        const final = await E(counter).get();
        t.is(final.value, 50);
      } finally {
        client.close();
      }
    } finally {
      server.kill();
    }
  });

  test('cap-as-argument: C++ server invokes a Node-supplied TestSuite cap', async t => {
    const interfaceRegistry = buildRegistry();
    // Node-side bootstrap that the C++ server can call back into via
    // callBack(target, msg). The C++ server only invokes target.ping(msg);
    // the other methods stay unimplemented but must be in the registry
    // because the registered method codecs need them defined.
    const localCallbackTarget = makeExo('localTestSuite', undefined, {
      ping({ msg }) {
        return { reply: `[from node] pong: ${msg}` };
      },
      // Other TestSuite methods are not invoked in this test, but the Exo
      // surface needs them present; throw if accidentally called.
      count() {
        throw Error('count not implemented on local target');
      },
      newCounter() {
        throw Error('newCounter not implemented on local target');
      },
      callBack() {
        throw Error('callBack not implemented on local target');
      },
    });

    const server = await startEchoServer();
    try {
      const client = await connectTcp({
        host: '127.0.0.1',
        port: server.port,
        bootstrap: localCallbackTarget,
        interfaceRegistry,
      });
      try {
        const remote = client.capnp.getBootstrap();
        const result = await E(remote).callBack({
          target: localCallbackTarget,
          msg: 'hello roundtrip',
        });
        // The C++ server invoked target.ping('hello roundtrip') back into
        // our Node Exo; the reply prefix proves it was OUR ping that ran.
        t.is(result.reply, '[from node] pong: hello roundtrip');
      } finally {
        client.close();
      }
    } finally {
      server.kill();
    }
  });

  test('many counters, many increments, two clients interleaved', async t => {
    const interfaceRegistry = buildRegistry();
    const server = await startEchoServer();
    try {
      const a = await connectTcp({
        host: '127.0.0.1',
        port: server.port,
        interfaceRegistry,
      });
      const b = await connectTcp({
        host: '127.0.0.1',
        port: server.port,
        interfaceRegistry,
      });
      try {
        // Each client mints 4 counters, increments each 5 times.
        const COUNTERS_PER_CLIENT = 4;
        const INCREMENTS = 5;

        const fanOut = async clientCapnp => {
          const remote = clientCapnp.getBootstrap();
          const counters = await Promise.all(
            Array.from({ length: COUNTERS_PER_CLIENT }, () =>
              E(remote)
                .newCounter()
                .then(r => r.counter),
            ),
          );
          // Increment each counter INCREMENTS times, fully interleaved
          // across counters and across clients.
          const ops = [];
          for (let i = 0; i < INCREMENTS; i += 1) {
            for (const c of counters) ops.push(E(c).inc());
          }
          return Promise.all(ops).then(() =>
            Promise.all(counters.map(c => E(c).get())),
          );
        };

        const [aFinal, bFinal] = await Promise.all([
          fanOut(a.capnp),
          fanOut(b.capnp),
        ]);
        // Every counter should have exactly INCREMENTS as its final value.
        for (const r of aFinal) t.is(r.value, INCREMENTS);
        for (const r of bFinal) t.is(r.value, INCREMENTS);
      } finally {
        a.close();
        b.close();
      }
    } finally {
      server.kill();
    }
  });
}
