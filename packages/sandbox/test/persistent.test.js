// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

import { makeSandboxFactory } from '../src/factory.js';

/** @import { SandboxMakeOpts } from '../src/types.js' */

/**
 * @typedef {object} StubMount
 * @property {(file: string, content: string) => Promise<void>} writeText
 * @property {(file: string) => Promise<string>} readText
 * @property {() => string} hostPath
 */

const StubMountInterface = M.interface('Mount', {
  help: M.call().returns(M.string()),
  hostPath: M.call().returns(M.string()),
  writeText: M.call(M.string(), M.string()).returns(M.promise()),
  readText: M.call(M.string()).returns(M.promise()),
  maybeReadText: M.call(M.string()).returns(M.promise()),
});

/**
 * Build a stub `SandboxPowers` whose `provideScratchMount(petName)` is
 * **idempotent**: the second call with the same petName returns the
 * same Mount-shaped exo backed by the same in-memory file map.  This
 * mirrors the pet-store-backed daemon behaviour we ultimately want for
 * the persistent-slice formula record (today's daemon `provideScratchMount`
 * mints a fresh formula on every call; the test-stub is the simplest
 * shim to exercise the on-disk record path before the daemon-side
 * idempotency lands).
 *
 * @returns {{
 *   powers: any,
 *   makeMountCapForPath: (path: string) => any,
 *   readRecordedSpec: (petName: string) => string | undefined,
 *   listScratchPetNames: () => string[],
 * }}
 */
const makeStubPowers = () => {
  /** @type {Map<string, { hostPath: string, files: Map<string, string>, cap: any }>} */
  const scratchByName = new Map();
  /** @type {WeakMap<object, string>} */
  const capToHostPath = new WeakMap();

  /** @param {string} hostPath */
  const wrapAsCap = hostPath => {
    /** @type {Map<string, string>} */
    const files = new Map();
    const cap = makeExo('Mount', StubMountInterface, {
      help: () => `stub Mount @ ${hostPath}`,
      hostPath: () => hostPath,
      writeText: async (/** @type {string} */ name, /** @type {string} */ content) => {
        files.set(name, content);
      },
      readText: async (/** @type {string} */ name) => {
        const v = files.get(name);
        if (v === undefined) {
          throw new Error(`stub Mount: no such file ${name}`);
        }
        return v;
      },
      maybeReadText: async (/** @type {string} */ name) => files.get(name),
    });
    capToHostPath.set(cap, hostPath);
    return { cap, files };
  };

  /** @param {string} hostPath */
  const makeMountCapForPath = hostPath => wrapAsCap(hostPath).cap;

  const powers = harden({
    /** @param {string} petName */
    provideScratchMount: async petName => {
      const cached = scratchByName.get(petName);
      if (cached !== undefined) return cached.cap;
      // Synthetic host path; the test never bind-mounts it, so a
      // fictitious string is sufficient.
      const hostPath = `/tmp/stub-scratch/${petName}`;
      const { cap, files } = wrapAsCap(hostPath);
      scratchByName.set(petName, { hostPath, files, cap });
      return cap;
    },
    /** @param {any} cap */
    provideHostPath: async cap => {
      const path = capToHostPath.get(cap);
      if (path === undefined) {
        throw new Error('stub provideHostPath: unknown cap');
      }
      return path;
    },
  });

  /** @param {string} petName */
  const readRecordedSpec = petName => {
    const entry = scratchByName.get(`sandbox-persistent-${petName}`);
    if (entry === undefined) return undefined;
    return entry.files.get('spec.json');
  };

  const listScratchPetNames = () => [...scratchByName.keys()].sort();

  return {
    powers,
    makeMountCapForPath,
    readRecordedSpec,
    listScratchPetNames,
  };
};

/**
 * Stub driver whose `prepareSlice` records the spec it received and
 * whose `spawn` / `teardown` are no-ops.  Together with the stub powers
 * above this exercises the factory's plumbing without depending on
 * bwrap or podman being installed.
 */
const makeStubDriver = () => {
  /** @type {Array<{ rootfs: any, mounts: any[], network: string }>} */
  const prepared = [];

  /** @type {Set<object>} */
  const liveSlices = new Set();

  const driver = harden({
    name: /** @type {const} */ ('bwrap'),
    probe: async () =>
      harden({ available: true, version: 'stub-1.0' }),
    prepareSlice: async (/** @type {any} */ spec) => {
      const ctx = harden({
        rootfs: spec.rootfs,
        mounts: spec.mounts,
        network: spec.network,
      });
      prepared.push({
        rootfs: spec.rootfs,
        mounts: [...spec.mounts],
        network: spec.network,
      });
      liveSlices.add(ctx);
      return ctx;
    },
    spawn: async () => {
      throw new Error('stub driver: spawn not implemented');
    },
    teardown: async (/** @type {any} */ ctx) => {
      liveSlices.delete(ctx);
    },
    fork: async () => {
      throw new Error('stub driver: fork not implemented');
    },
    probeNestedSlice: async () =>
      harden({ available: false, reason: 'stub driver' }),
  });

  return { driver, prepared, liveSlices };
};

test('makePersistent rejects malformed names at the boundary', async t => {
  const { powers } = makeStubPowers();
  const { driver } = makeStubDriver();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: /** @type {any} */ (powers),
  });

  for (const bad of ['', 'has space', 'UPPERCASE', '@self', '../escape']) {
    // eslint-disable-next-line no-await-in-loop, @jessie.js/safe-await-separator
    await t.throwsAsync(
      () =>
        E(factory).makePersistent(
          bad,
          harden({ rootfs: { kind: 'host-bind' } }),
        ),
      { message: /makePersistent: name must match/ },
      `rejects ${JSON.stringify(bad)}`,
    );
  }
});

test('makePersistent caches by name within a factory instance', async t => {
  const { powers } = makeStubPowers();
  const { driver, prepared } = makeStubDriver();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: /** @type {any} */ (powers),
  });

  /** @type {SandboxMakeOpts} */
  const opts = harden({
    rootfs: { kind: 'host-bind' },
    network: 'private',
  });
  const h1 = await E(factory).makePersistent('main-genie-sandbox', opts);
  const h2 = await E(factory).makePersistent('main-genie-sandbox', opts);
  t.is(h1, h2, 'second call returns the same handle');
  t.is(
    prepared.length,
    1,
    'driver.prepareSlice runs only once for a cached persistent name',
  );

  const listed = await E(factory).listPersistent();
  t.deepEqual(
    [...listed],
    [
      {
        name: 'main-genie-sandbox',
        network: 'private',
        backend: 'auto',
      },
    ],
    'listPersistent surfaces the pinned slice',
  );
});

test('makePersistent records the resolved spec on disk', async t => {
  const { powers, makeMountCapForPath, readRecordedSpec } = makeStubPowers();
  const { driver } = makeStubDriver();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: /** @type {any} */ (powers),
  });

  const workspaceCap = makeMountCapForPath('/host/workspace');
  await E(factory).makePersistent(
    'main-genie-sandbox',
    harden({
      rootfs: { kind: 'host-bind' },
      mounts: [
        { cap: workspaceCap, innerPath: '/workspace', mode: 'rw' },
      ],
      network: 'private',
      backend: 'auto',
    }),
  );

  const recordedJson = readRecordedSpec('main-genie-sandbox');
  t.truthy(recordedJson, 'spec.json was written under sandbox-persistent-<name>');
  const recorded = JSON.parse(/** @type {string} */ (recordedJson));
  t.is(recorded.schemaVersion, 1, 'record carries a schema version');
  t.is(recorded.name, 'main-genie-sandbox');
  t.is(recorded.network, 'private');
  t.is(recorded.backend, 'auto');
  t.deepEqual(recorded.rootfs, { kind: 'host-bind' });
  t.deepEqual(
    recorded.mounts,
    [
      {
        hostPath: '/host/workspace',
        innerPath: '/workspace',
        mode: 'rw',
      },
    ],
    'the resolved host path of the workspace mount round-trips into the record',
  );
});

test('forgetPersistent drops the in-memory pin and re-mints on the next call', async t => {
  const { powers } = makeStubPowers();
  const { driver, prepared } = makeStubDriver();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: /** @type {any} */ (powers),
  });

  /** @type {SandboxMakeOpts} */
  const opts = harden({
    rootfs: { kind: 'host-bind' },
    network: 'none',
  });

  const h1 = await E(factory).makePersistent('foo', opts);
  t.is(prepared.length, 1);
  const forgot = await E(factory).forgetPersistent('foo');
  t.true(forgot, 'forget returns true when an entry was forgotten');
  const forgotAgain = await E(factory).forgetPersistent('foo');
  t.false(forgotAgain, 'second forget returns false');

  const h2 = await E(factory).makePersistent('foo', opts);
  t.not(h1, h2, 'after forget, makePersistent mints a fresh handle');
  t.is(prepared.length, 2, 'driver.prepareSlice runs again after forget');
});

test('a fresh factory backed by the same powers re-mints from the same recorded spec', async t => {
  const { powers, readRecordedSpec } = makeStubPowers();
  const { driver: driver1 } = makeStubDriver();
  const factory1 = makeSandboxFactory({
    drivers: harden([driver1]),
    scratchProvider: /** @type {any} */ (powers),
  });

  /** @type {SandboxMakeOpts} */
  const opts = harden({
    rootfs: { kind: 'host-bind' },
    network: 'private',
  });
  const h1 = await E(factory1).makePersistent('main-genie-sandbox', opts);
  t.truthy(h1);
  const recorded1 = readRecordedSpec('main-genie-sandbox');
  t.truthy(recorded1, 'first factory wrote the spec record');

  // Simulate a daemon restart: the factory is reincarnated from its
  // make-unconfined formula but its in-memory map is gone.  The new
  // factory shares the same powers (the daemon's scratch service
  // survives across the bounce), so the previous spec record is still
  // on disk under the same petName.
  const { driver: driver2, prepared: prepared2 } = makeStubDriver();
  const factory2 = makeSandboxFactory({
    drivers: harden([driver2]),
    scratchProvider: /** @type {any} */ (powers),
  });

  // Caller (e.g. main.js's idempotent boot) re-invokes with the same
  // opts; the factory mints a fresh slice on the new driver and
  // re-writes the record (idempotent at the byte level).
  const h2 = await E(factory2).makePersistent('main-genie-sandbox', opts);
  t.truthy(h2, 'second factory mints a fresh handle');
  t.not(h1, h2, 'handles are distinct objects across factory instances');
  t.is(
    prepared2.length,
    1,
    'fresh factory ran prepareSlice exactly once during the rebuild',
  );

  const recorded2 = readRecordedSpec('main-genie-sandbox');
  t.is(recorded2, recorded1, 'recorded spec is byte-identical across rebirths');
});

test('CapTP introspection surfaces the persistent-slice methods', async t => {
  const { powers } = makeStubPowers();
  const factory = makeSandboxFactory({
    drivers: harden([]),
    scratchProvider: /** @type {any} */ (powers),
  });
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (factory)).__getMethodNames__();
  const userMethods = [...methods].filter(m => !m.startsWith('__')).sort();
  t.deepEqual(userMethods, [
    'forgetPersistent',
    'help',
    'listBackends',
    'listPersistent',
    'make',
    'makePersistent',
  ]);
});
