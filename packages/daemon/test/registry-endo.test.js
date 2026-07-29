// @ts-nocheck

// Integration test: the `@registry` special name is populated on every host
// (mirroring `@node`), so `E(host).lookup('@registry')` returns the host's
// EndoRegistry capability without the caller branching on its presence.  See
// designs/registry-capability.md § Host special name.
//
// The socket path lives under a short os.tmpdir() directory to stay within
// the ~104-char unix-domain-socket limit regardless of the checkout path.

// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import os from 'os';
import path from 'path';
import fsp from 'fs/promises';
import { E } from '@endo/eventual-send';
import { makeCancelKit } from '@endo/cancel';
import { start, stop, purge, makeEndoClient } from '../index.js';

const contexts = [];

test.afterEach.always(async () => {
  while (contexts.length > 0) {
    const { cancel, config, root } = contexts.pop();
    // eslint-disable-next-line no-await-in-loop
    await stop(config).catch(() => {});
    cancel(new Error('test teardown'));
    // eslint-disable-next-line no-await-in-loop
    await fsp.rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

const prepare = async t => {
  const { cancel, cancelled } = makeCancelKit();
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'endo-reg-'));
  const config = {
    statePath: path.join(root, 'state'),
    ephemeralStatePath: path.join(root, 'run'),
    cachePath: path.join(root, 'cache'),
    sockPath: path.join(root, 'endo.sock'),
    address: '127.0.0.1:0',
    pets: new Map(),
    values: new Map(),
  };
  await purge(config);
  await start(config);
  contexts.push({ cancel, config, root });

  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  closed.catch(() => {});
  const host = E(getBootstrap()).host();
  return { host, cancelled };
};

test.serial('E(host).lookup("@registry") resolves an EndoRegistry', async t => {
  const { host } = await prepare(t);
  const registry = await E(host).lookup('@registry');
  t.truthy(registry, '@registry is populated on the host');
  const help = await E(registry).help();
  t.true(
    typeof help === 'string' && help.includes('EndoRegistry'),
    'the registry reports its help',
  );
});

test.serial(
  '@registry lookup(name, version) is undefined before any fetch',
  async t => {
    const { host } = await prepare(t);
    const registry = await E(host).lookup('@registry');
    const missing = await E(registry).lookup('ses', '1.0.0');
    t.is(missing, undefined, 'an unfetched package is absent from the table');
    const listed = await E(registry).list();
    t.deepEqual(listed, [], 'the registry table starts empty');
  },
);

test.serial(
  '@registry survives a fresh client connection (formula is persisted)',
  async t => {
    const { host, cancelled } = await prepare(t);
    const first = await E(host).lookup('@registry');
    t.truthy(first);
    // A second client over the same daemon still sees the slot; the host
    // formula carries the required registry field.
    const { getBootstrap, closed } = await makeEndoClient(
      'client-2',
      contexts[contexts.length - 1].config.sockPath,
      cancelled,
    );
    closed.catch(() => {});
    const host2 = E(getBootstrap()).host();
    const again = await E(host2).lookup('@registry');
    t.truthy(again, '@registry resolves for a second client');
  },
);
