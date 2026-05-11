// @ts-check

/* global Buffer */

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

import { spawn as nodeSpawn } from 'node:child_process';
import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import {
  ENDO_SANDBOX_PREFIX,
  makePodmanDriver,
} from '../src/drivers/podman.js';
import { makeSandboxFactory } from '../src/factory.js';

const StubMountInterface = M.interface('Mount', {
  help: M.call().returns(M.string()),
  hostPath: M.call().returns(M.string()),
});

/**
 * OCI image used for acceptance tests.  Alpine is small (~5 MiB), the
 * `apk` package manager exits 0 on a clean update, and busybox covers
 * `/bin/sh`, `/bin/cat`, `/bin/echo`, and `ls` — every command the
 * tests rely on inside the slice.
 */
const ALPINE_REF = 'docker.io/library/alpine:3.19';

/**
 * Run a host-side podman command and resolve with its captured stdio.
 *
 * @param {string[]} args
 * @returns {Promise<{ code: number | null; stdout: string; stderr: string }>}
 */
const podmanRun = async args => {
  await null;
  return new Promise(resolve => {
    let child;
    try {
      child = nodeSpawn('podman', args, { stdio: 'pipe' });
    } catch (e) {
      resolve({
        code: null,
        stdout: '',
        stderr: /** @type {Error} */ (e).message,
      });
      return;
    }
    /** @type {Buffer[]} */
    const o = [];
    /** @type {Buffer[]} */
    const er = [];
    child.stdout?.on('data', c => o.push(c));
    child.stderr?.on('data', c => er.push(c));
    child.once('error', e =>
      resolve({
        code: null,
        stdout: '',
        stderr: /** @type {Error} */ (e).message,
      }),
    );
    child.once('close', code =>
      resolve({
        code,
        stdout: Buffer.concat(o).toString('utf8'),
        stderr: Buffer.concat(er).toString('utf8'),
      }),
    );
  });
};

/**
 * @typedef {object} PodmanAvailability
 * @property {boolean} available    Whether the suite can exercise podman.
 * @property {string} [version]     Podman version string when present.
 * @property {boolean} [imagePresent]  Whether the alpine image is in
 *                                  the user's local storage already.
 *                                  Tests gate any `apk` / network case
 *                                  on this so a CI host without
 *                                  internet access still passes.
 * @property {string} [reason]      Human-readable reason when
 *                                  unavailable.
 */

/**
 * Probe `podman --version`, rootless mode, and image presence so each
 * test can decide whether to skip gracefully.
 *
 * @returns {Promise<PodmanAvailability>}
 */
const probePodman = async () => {
  const version = await podmanRun(['--version']);
  if (version.code !== 0) {
    return {
      available: false,
      reason: `podman --version exit ${version.code}: ${version.stderr.trim()}`,
    };
  }
  const rootless = await podmanRun([
    'info',
    '--format',
    '{{.Host.Security.Rootless}}',
  ]);
  if (rootless.code !== 0 || rootless.stdout.trim() !== 'true') {
    return {
      available: false,
      reason: `podman not rootless: ${rootless.stdout.trim() || rootless.stderr.trim()}`,
    };
  }
  // Snapshot whether the alpine image is already present.  Tests that
  // need the image but cannot reach the registry will skip rather than
  // flake; tests that only need probe() / orphan reap still run.
  const imageExists = await podmanRun(['image', 'exists', ALPINE_REF]);
  const m = version.stdout.match(/(\d+(?:\.\d+){0,3})/);
  return {
    available: true,
    version: m ? m[1] : version.stdout.trim(),
    imagePresent: imageExists.code === 0,
  };
};

/** @type {PodmanAvailability} */
let podmanAvailability = { available: false, reason: 'not yet probed' };

test.serial.before(async _t => {
  podmanAvailability = await probePodman();
});

/**
 * @returns {{
 *   powers: any,
 *   makeMountCapForPath: (path: string) => any,
 *   tmpdirs: string[],
 * }}
 */
const makeStubScratchProvider = () => {
  /** @type {string[]} */
  const tmpdirs = [];
  /** @type {WeakMap<object, string>} */
  const capToHostPath = new WeakMap();

  /** @param {string} hostPath */
  const wrapAsCap = hostPath => {
    const cap = makeExo('Mount', StubMountInterface, {
      help: () => `stub Mount @ ${hostPath}`,
      hostPath: () => hostPath,
    });
    capToHostPath.set(cap, hostPath);
    return cap;
  };

  /** @param {string} path */
  const makeMountCapForPath = path => wrapAsCap(path);

  const powers = harden({
    /** @param {string} petName */
    provideScratchMount: async petName => {
      const dir = nodeFs.mkdtempSync(
        nodePath.join(nodeOs.tmpdir(), `endo-sandbox-podman-${petName}-`),
      );
      tmpdirs.push(dir);
      return wrapAsCap(dir);
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

  return { powers, makeMountCapForPath, tmpdirs };
};

/**
 * @param {string[]} tmpdirs
 */
const cleanupTmpdirs = tmpdirs => {
  for (const dir of tmpdirs) {
    try {
      nodeFs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
};

/**
 * Drain a ReaderRef-shaped exo into a Buffer.
 *
 * @param {any} reader
 * @returns {Promise<Buffer>}
 */
const drainReader = async reader => {
  await null;
  /** @type {Uint8Array[]} */
  const chunks = [];
  for (;;) {
    // eslint-disable-next-line no-await-in-loop, @jessie.js/safe-await-separator
    const { done, value } = await E(reader).next();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c)));
};

test.serial('podman probe reports rootless availability + version', async t => {
  if (!podmanAvailability.available) {
    t.pass(`podman not available: ${podmanAvailability.reason}`);
    return;
  }
  // `reapOrphans: false` keeps the boot-time sweep out of this probe
  // so other tests can manage their own fixtures predictably.
  const driver = makePodmanDriver({ env: {}, reapOrphans: false });
  const probe = await driver.probe();
  t.true(probe.available, `probe should report available: ${probe.reason}`);
  t.is(typeof probe.version, 'string');
  t.regex(probe.version ?? '', /\d+\.\d+/);
  t.truthy(probe.details, 'probe carries details');
  t.true(
    probe.details?.rootless?.available,
    'rootless flag is reported in details',
  );
});

test.serial(
  'listBackends() reports podman available via the factory',
  async t => {
    if (!podmanAvailability.available) {
      t.pass(`podman not available: ${podmanAvailability.reason}`);
      return;
    }
    const driver = makePodmanDriver({ env: {}, reapOrphans: false });
    const { powers } = makeStubScratchProvider();
    const factory = makeSandboxFactory({
      drivers: harden([driver]),
      scratchProvider: powers,
    });
    const backends = await E(factory).listBackends();
    t.is(backends.length, 1);
    t.is(backends[0].name, 'podman');
    t.true(backends[0].available);
  },
);

test.serial('alpine OCI slice spawns /bin/echo hello', async t => {
  if (!podmanAvailability.available || !podmanAvailability.imagePresent) {
    t.pass(
      `podman or alpine image not available: ${podmanAvailability.reason ?? 'image absent'}`,
    );
    return;
  }
  const driver = makePodmanDriver({ env: {}, reapOrphans: false });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });

  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'oci', ref: ALPINE_REF },
      network: 'none',
      backend: 'podman',
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    cleanupTmpdirs(tmpdirs);
  });

  const proc = await E(handle).spawn(harden(['/bin/echo', 'hello']));
  const stdoutPromise = drainReader(await E(proc).stdout());
  const exit = await E(proc).wait();
  const stdout = await stdoutPromise;
  t.is(exit.code, 0, `exit code 0, got ${exit.code}`);
  t.true(stdout.toString('utf8').startsWith('hello'));
});

test.serial(
  'read-only mount rejects writes from inside the alpine slice',
  async t => {
    if (!podmanAvailability.available || !podmanAvailability.imagePresent) {
      t.pass(
        `podman or alpine image not available: ${podmanAvailability.reason ?? 'image absent'}`,
      );
      return;
    }
    const driver = makePodmanDriver({ env: {}, reapOrphans: false });
    const { powers, makeMountCapForPath, tmpdirs } = makeStubScratchProvider();
    const factory = makeSandboxFactory({
      drivers: harden([driver]),
      scratchProvider: powers,
    });

    const roHost = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'endo-sandbox-podman-ro-'),
    );
    tmpdirs.push(roHost);
    nodeFs.writeFileSync(nodePath.join(roHost, 'sentinel'), 'baseline\n');

    const roMountCap = makeMountCapForPath(roHost);
    const handle = await E(factory).make(
      harden({
        rootfs: { kind: 'oci', ref: ALPINE_REF },
        mounts: [{ cap: roMountCap, innerPath: '/ro', mode: 'ro' }],
        network: 'none',
        backend: 'podman',
      }),
    );
    t.teardown(async () => {
      await E(handle).dispose();
      cleanupTmpdirs(tmpdirs);
    });

    const proc = await E(handle).spawn(
      harden(['/bin/sh', '-c', 'echo nope > /ro/should-fail']),
    );
    const stderr = await drainReader(await E(proc).stderr());
    const exit = await E(proc).wait();
    t.not(exit.code, 0, 'write to /ro should fail');
    t.regex(
      stderr.toString('utf8'),
      /Read-only file system|Permission denied|read-only/i,
      'stderr should mention read-only',
    );

    const proc2 = await E(handle).spawn(harden(['/bin/cat', '/ro/sentinel']));
    const stdout2 = await drainReader(await E(proc2).stdout());
    const exit2 = await E(proc2).wait();
    t.is(exit2.code, 0);
    t.is(stdout2.toString('utf8'), 'baseline\n');
  },
);

test.serial('network: none blocks external reach in alpine slice', async t => {
  if (!podmanAvailability.available || !podmanAvailability.imagePresent) {
    t.pass(
      `podman or alpine image not available: ${podmanAvailability.reason ?? 'image absent'}`,
    );
    return;
  }
  const driver = makePodmanDriver({ env: {}, reapOrphans: false });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });

  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'oci', ref: ALPINE_REF },
      network: 'none',
      backend: 'podman',
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    cleanupTmpdirs(tmpdirs);
  });

  // Alpine ships busybox `ls` and `cat` — enumerate /sys/class/net to
  // confirm only `lo` is present (mirrors the bwrap network-none case).
  const proc = await E(handle).spawn(
    harden(['/bin/sh', '-c', 'ls /sys/class/net 2>/dev/null || true']),
  );
  const stdout = await drainReader(await E(proc).stdout());
  await E(proc).wait();
  const ifaces = stdout
    .toString('utf8')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s !== '');
  t.deepEqual(
    ifaces.filter(i => i !== 'lo').sort(),
    [],
    'no non-loopback interfaces in network: none',
  );
});

test.serial(
  'network: private mounts a routable interface other than lo',
  async t => {
    if (!podmanAvailability.available || !podmanAvailability.imagePresent) {
      t.pass(
        `podman or alpine image not available: ${podmanAvailability.reason ?? 'image absent'}`,
      );
      return;
    }
    // Skip when neither slirp4netns nor pasta is on PATH — pure
    // Phase 1 hosts may not have either.
    const slirpProbe = await podmanRun(['unshare', '--', 'true']);
    void slirpProbe;
    const driver = makePodmanDriver({ env: {}, reapOrphans: false });
    const { powers, tmpdirs } = makeStubScratchProvider();
    const factory = makeSandboxFactory({
      drivers: harden([driver]),
      scratchProvider: powers,
    });
    let handle;
    try {
      handle = await E(factory).make(
        harden({
          rootfs: { kind: 'oci', ref: ALPINE_REF },
          network: 'private',
          backend: 'podman',
        }),
      );
    } catch (e) {
      // The driver throws a structured error when neither pasta nor
      // slirp4netns is on PATH; treat that case as a graceful skip
      // rather than a flake.
      if (/slirp4netns or pasta/.test(/** @type {Error} */ (e).message)) {
        t.pass(
          `rootless network backend missing: ${/** @type {Error} */ (e).message}`,
        );
        return;
      }
      throw e;
    }
    t.teardown(async () => {
      await E(handle).dispose();
      cleanupTmpdirs(tmpdirs);
    });
    // Inside a `private` slice pasta / slirp4netns brings up at least
    // one tap interface besides `lo`.  We don't assert a specific
    // name (tap0 / eth0 / ns0) — only that the slice has more than
    // just loopback, which is the user-visible difference between
    // `none` and `private`.
    const proc = await E(handle).spawn(
      harden(['/bin/sh', '-c', 'ls /sys/class/net 2>/dev/null || true']),
    );
    const stdout = await drainReader(await E(proc).stdout());
    await E(proc).wait();
    const ifaces = stdout
      .toString('utf8')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s !== '');
    t.true(ifaces.includes('lo'), 'loopback present inside private slice');
    t.true(
      ifaces.some(i => i !== 'lo'),
      `non-loopback interface should be present: ${ifaces.join(', ')}`,
    );
  },
);

test.serial('apk update succeeds inside a private alpine slice', async t => {
  await null;
  if (!podmanAvailability.available || !podmanAvailability.imagePresent) {
    t.pass(
      `podman or alpine image not available: ${podmanAvailability.reason ?? 'image absent'}`,
    );
    return;
  }
  const driver = makePodmanDriver({ env: {}, reapOrphans: false });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });
  let handle;
  try {
    handle = await E(factory).make(
      harden({
        rootfs: { kind: 'oci', ref: ALPINE_REF },
        network: 'private',
        backend: 'podman',
      }),
    );
  } catch (e) {
    if (/slirp4netns or pasta/.test(/** @type {Error} */ (e).message)) {
      t.pass(
        `rootless network backend missing: ${/** @type {Error} */ (e).message}`,
      );
      return;
    }
    throw e;
  }
  t.teardown(async () => {
    await E(handle).dispose();
    cleanupTmpdirs(tmpdirs);
  });
  // `apk update` is the Alpine analog of `apt update`.  We cannot
  // claim public mirror reachability on every CI host, so the test
  // accepts both: a code-0 success and a network-error skip.  When
  // the test passes, the upgraded package metadata lives in the
  // container's writable layer (or /scratch when bound) — never in
  // the host's image-store layer, which is `--read-only`.
  const proc = await E(handle).spawn(harden(['/sbin/apk', 'update']));
  const stdout = await drainReader(await E(proc).stdout());
  const stderr = await drainReader(await E(proc).stderr());
  const exit = await E(proc).wait();
  if (exit.code !== 0) {
    // Common offline failures: DNS miss, ENETUNREACH, certificate
    // verification.  Surface them as a soft skip so the test stays
    // useful in air-gapped CI.
    const why = stderr.toString('utf8') || stdout.toString('utf8');
    t.pass(`apk update could not reach the mirrors: ${why.slice(0, 200)}`);
    return;
  }
  t.regex(
    stdout.toString('utf8'),
    /OK:|fetch /,
    'apk update output should mention fetch / OK',
  );
});

test.serial('orphan reap sweeps stale endo-sandbox- containers', async t => {
  if (!podmanAvailability.available || !podmanAvailability.imagePresent) {
    t.pass(
      `podman or alpine image not available: ${podmanAvailability.reason ?? 'image absent'}`,
    );
    return;
  }
  // Pre-create a sentinel container with the documented prefix so the
  // boot-time sweep has something to reap.  The container exits
  // immediately (`/bin/true`) so we are reaping an exited record, not
  // a running namespace.
  const sentinelName = `${ENDO_SANDBOX_PREFIX}stale-${Date.now().toString(16)}`;
  const created = await podmanRun([
    'create',
    '--name',
    sentinelName,
    ALPINE_REF,
    '/bin/true',
  ]);
  t.teardown(async () => {
    // Best-effort cleanup in case the test fails before the reap.
    await podmanRun(['rm', '-f', sentinelName]);
  });
  if (created.code !== 0) {
    t.pass(`could not pre-create sentinel: ${created.stderr.trim()}`);
    return;
  }

  const driver = makePodmanDriver({ env: {}, reapOrphans: true });
  const probe = await driver.probe();
  t.true(probe.available);

  const after = await podmanRun([
    'ps',
    '-a',
    '--filter',
    `name=${sentinelName}`,
    '--format',
    '{{.Names}}',
  ]);
  t.is(
    after.stdout.trim(),
    '',
    `sentinel ${sentinelName} should have been reaped, podman ps reports: ${after.stdout.trim() || '(empty)'}`,
  );
});

test.serial(
  'podman driver rejects non-OCI rootfs at slice construction',
  async t => {
    if (!podmanAvailability.available) {
      t.pass(`podman not available: ${podmanAvailability.reason}`);
      return;
    }
    const driver = makePodmanDriver({ env: {}, reapOrphans: false });
    const { powers, tmpdirs } = makeStubScratchProvider();
    const factory = makeSandboxFactory({
      drivers: harden([driver]),
      scratchProvider: powers,
    });
    await t.throwsAsync(
      () =>
        E(factory).make(
          harden({
            rootfs: { kind: 'host-bind' },
            network: 'none',
            backend: 'podman',
          }),
        ),
      { message: /podman driver only supports rootfs/ },
    );
    cleanupTmpdirs(tmpdirs);
  },
);

test.serial(
  'slice.help() reports the rootless and rootless-net layers',
  async t => {
    if (!podmanAvailability.available || !podmanAvailability.imagePresent) {
      t.pass(
        `podman or alpine image not available: ${podmanAvailability.reason ?? 'image absent'}`,
      );
      return;
    }
    const driver = makePodmanDriver({ env: {}, reapOrphans: false });
    const { powers, tmpdirs } = makeStubScratchProvider();
    const factory = makeSandboxFactory({
      drivers: harden([driver]),
      scratchProvider: powers,
    });
    const handle = await E(factory).make(
      harden({
        rootfs: { kind: 'oci', ref: ALPINE_REF },
        network: 'none',
        backend: 'podman',
      }),
    );
    t.teardown(async () => {
      await E(handle).dispose();
      cleanupTmpdirs(tmpdirs);
    });
    const help = await E(handle).help();
    t.regex(help, /Hardening layers in effect:/);
    t.regex(help, /network: none/);
    t.regex(help, /rootless: yes/);
    // rootless-net only matters for `private`; for `none` the row
    // still renders with the detected backend (or "none" when neither
    // is on PATH).
    t.regex(help, /rootless-net: (slirp4netns|pasta|none)/);
  },
);

test.serial('fork() throws notImplemented before Phase 3', async t => {
  if (!podmanAvailability.available || !podmanAvailability.imagePresent) {
    t.pass(
      `podman or alpine image not available: ${podmanAvailability.reason ?? 'image absent'}`,
    );
    return;
  }
  const driver = makePodmanDriver({ env: {}, reapOrphans: false });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });
  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'oci', ref: ALPINE_REF },
      network: 'none',
      backend: 'podman',
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    cleanupTmpdirs(tmpdirs);
  });
  await t.throwsAsync(() => E(handle).fork(), {
    message: /Phase 3/,
  });
});
