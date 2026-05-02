// @ts-check
/* global process */

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { start, stop, purge, makeEndoClient } from '../index.js';

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();
const { raw } = String;

// These tests verify that a single state directory can be opened
// and used by either the Node-supervised daemon (no ENDO_BIN) or
// the Rust-supervised daemon (ENDO_BIN set), with no migration
// step between them.  They require the Rust binary to be available
// so they can switch supervisors at run time.
//
// Until the XS daemon has SQLite parity with daemon-database.js,
// pet-store entries written by the Node supervisor will not be
// visible to the Rust supervisor (which reads/writes JSON via
// daemon-persistence-powers.js), and vice versa.  The tests are
// declared with test.serial.failing so they document the gap and
// will start passing as soon as the gap is closed — at which
// point an unexpected pass fails the suite, alerting us to flip
// them back to .serial.
const skipNoRustBinary = !process.env.ENDO_BIN;

/**
 * Save the current ENDO_BIN, set it to the desired value (or
 * delete it), and return a restorer.
 *
 * @param {string | undefined} bin
 */
const setEndoBin = bin => {
  const previous = process.env.ENDO_BIN;
  if (bin === undefined) {
    delete process.env.ENDO_BIN;
  } else {
    process.env.ENDO_BIN = bin;
  }
  return () => {
    if (previous === undefined) {
      delete process.env.ENDO_BIN;
    } else {
      process.env.ENDO_BIN = previous;
    }
  };
};

let cfgId = 0;

// Unix domain socket paths are limited to ~104 chars on Linux
// and ~90 on macOS.  Mirror the truncation in endo.test.js so
// test directory names don't blow that budget.
const MAX_UNIX_SOCKET_PATH = 90;
const SOCKET_PATH_OVERHEAD =
  path.join(dirname, 'tmp').length + 1 + 'endo.sock'.length + 8;
const MAX_CONFIG_DIR_LENGTH = Math.max(
  8,
  MAX_UNIX_SOCKET_PATH - SOCKET_PATH_OVERHEAD,
);

/**
 * Build a fresh config under a unique tmp subdir so multiple
 * invocations within one test don't collide.  Mirrors the
 * helper in endo.test.js (including socket-path truncation)
 * without re-exporting it from there.
 *
 * @param {string} title
 */
const makeFreshConfig = title => {
  const safeTitle = title.replace(/\s/giu, '-').replace(/[^\w-]/giu, '');
  const truncated =
    safeTitle.length <= MAX_CONFIG_DIR_LENGTH
      ? safeTitle
      : safeTitle.slice(0, MAX_CONFIG_DIR_LENGTH);
  const dir = `${truncated}#${String(cfgId).padStart(4, '0')}`;
  cfgId += 1;
  const root = ['tmp', dir];
  return {
    statePath: path.join(dirname, ...root, 'state'),
    ephemeralStatePath: path.join(dirname, ...root, 'run'),
    cachePath: path.join(dirname, ...root, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${dir}-test.sock`
        : path.join(dirname, ...root, 'endo.sock'),
    address: '127.0.0.1:0',
    gcEnabled: false,
    pets: new Map(),
    values: new Map(),
  };
};

/**
 * Run a callback against a freshly-(re)started daemon at the given
 * config, with the supplied ENDO_BIN setting.  Stops the daemon and
 * restores ENDO_BIN before returning.
 *
 * @param {ReturnType<typeof makeFreshConfig>} config
 * @param {string | undefined} bin - undefined = Node daemon, string = Rust binary
 * @param {(ctx: { host: any, cancelled: Promise<never>, cancel: (e?: Error) => void }) => Promise<void>} body
 */
const runWith = async (config, bin, body) => {
  const restore = setEndoBin(bin);
  const { reject: cancel, promise: cancelled } =
    /** @type {ReturnType<typeof makePromiseKit<never>>} */ (makePromiseKit());
  cancelled.catch(() => {});
  try {
    await start(config);
    const { getBootstrap, closed } = await makeEndoClient(
      'cross-supervisor',
      config.sockPath,
      cancelled,
    );
    closed.catch(() => {});
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    await body({ host, cancelled, cancel });
  } finally {
    cancel(Error('cross-supervisor body complete'));
    await stop(config).catch(err => {
      // Ignore teardown noise; the next start will clean up.
      console.error('cross-supervisor stop error:', err.message);
    });
    restore();
  }
};

const isFresh = skipNoRustBinary ? test.serial.skip : test.serial;

isFresh('cross-supervisor: Node→Rust pet name round-trip', async t => {
  const config = makeFreshConfig(t.title);
  await purge(config);

  // 1. Node supervisor writes a pet name pointing to a stored value.
  await runWith(config, undefined, async ({ host }) => {
    await E(host).storeValue('hello-from-node', 'greeting');
    const value = await E(host).lookup(['greeting']);
    t.is(value, 'hello-from-node');
  });

  // 2. Rust supervisor opens the same statePath, reads the value.
  await runWith(
    config,
    /** @type {string} */ (process.env.ENDO_BIN),
    async ({ host }) => {
      const value = await E(host).lookup(['greeting']);
      t.is(value, 'hello-from-node');
    },
  );
});

isFresh('cross-supervisor: Rust→Node pet name round-trip', async t => {
  const config = makeFreshConfig(t.title);
  await purge(config);

  // 1. Rust supervisor writes the pet name.
  await runWith(
    config,
    /** @type {string} */ (process.env.ENDO_BIN),
    async ({ host }) => {
      await E(host).storeValue('hello-from-rust', 'greeting');
      const value = await E(host).lookup(['greeting']);
      t.is(value, 'hello-from-rust');
    },
  );

  // 2. Node supervisor opens the same statePath, reads it back.
  await runWith(config, undefined, async ({ host }) => {
    const value = await E(host).lookup(['greeting']);
    t.is(value, 'hello-from-rust');
  });
});

isFresh(
  'cross-supervisor: Node→Rust→Node round-trip preserves both halves',
  async t => {
    const config = makeFreshConfig(t.title);
    await purge(config);

    // 1. Node writes "first".
    await runWith(config, undefined, async ({ host }) => {
      await E(host).storeValue('first-on-node', 'first');
    });

    // 2. Rust opens the same state, reads "first", writes "second".
    await runWith(
      config,
      /** @type {string} */ (process.env.ENDO_BIN),
      async ({ host }) => {
        const seen = await E(host).lookup(['first']);
        t.is(seen, 'first-on-node');
        await E(host).storeValue('second-on-rust', 'second');
      },
    );

    // 3. Node opens again, sees both pet names.
    await runWith(config, undefined, async ({ host }) => {
      t.is(await E(host).lookup(['first']), 'first-on-node');
      t.is(await E(host).lookup(['second']), 'second-on-rust');
    });
  },
);

isFresh(
  'cross-supervisor: agent identity (root keypair) survives Node↔Rust handoff',
  async t => {
    const config = makeFreshConfig(t.title);
    await purge(config);

    /** @type {string | undefined} */
    let nodeAgentId;

    // 1. Node creates the root host; record its @agent identifier.
    await runWith(config, undefined, async ({ host }) => {
      nodeAgentId = /** @type {string} */ (await E(host).identify('@agent'));
      t.truthy(nodeAgentId);
    });

    // 2. Rust opens the same state.  The same root keypair must
    //    yield the same agent identifier — otherwise the host has
    //    silently re-formulated and the formula graph is orphaned.
    await runWith(
      config,
      /** @type {string} */ (process.env.ENDO_BIN),
      async ({ host }) => {
        const rustAgentId = await E(host).identify('@agent');
        t.is(rustAgentId, nodeAgentId);
      },
    );
  },
);

// Ignore the dirname symbol in case lint complains about it being
// unused while the failing tests are stubbed.
void dirname;
