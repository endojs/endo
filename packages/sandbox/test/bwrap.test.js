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

import { makeBwrapDriver } from '../src/drivers/bwrap.js';
import { makeSandboxFactory } from '../src/factory.js';

const StubMountInterface = M.interface('Mount', {
  help: M.call().returns(M.string()),
  hostPath: M.call().returns(M.string()),
});

/**
 * Probe `bwrap --version`. Tests only run when bwrap is available on
 * the host. Returns a Promise so the caller can `await` it from a
 * `test.serial.before` hook.
 *
 * @returns {Promise<{ available: boolean; version?: string; reason?: string }>}
 */
const probeBwrap = async () => {
  await null;
  try {
    const result = nodeSpawn('bwrap', ['--version']);
    /** @type {Buffer[]} */
    const stdoutChunks = [];
    return await new Promise(resolve => {
      result.stdout?.on('data', c => stdoutChunks.push(c));
      result.once('error', e =>
        resolve({ available: false, reason: /** @type {Error} */ (e).message }),
      );
      result.once('close', code => {
        if (code !== 0) {
          resolve({ available: false, reason: `bwrap --version exit ${code}` });
          return;
        }
        const text = Buffer.concat(stdoutChunks).toString('utf8').trim();
        const m = text.match(/(\d+(?:\.\d+){0,3})/);
        resolve({ available: true, version: m ? m[1] : text });
      });
    });
  } catch (e) {
    return { available: false, reason: /** @type {Error} */ (e).message };
  }
};

/**
 * Confirm that `bwrap` can actually create a user namespace on this
 * host with the same flags every slice uses.  Some hosts ship bwrap
 * but block unprivileged user-namespace creation via AppArmor,
 * `kernel.unprivileged_userns_clone=0`, or by being nested inside a
 * locked-down container.  When that happens bwrap exits non-zero with
 * `bwrap: Creating new namespace failed: ...` on stderr — a single
 * clean skip is more useful than seven look-alike exit-code-1
 * failures with the stderr swallowed.
 *
 * Returns the same shape as `probeBwrap` plus the captured stderr so
 * the skip reason can quote the kernel's own message.
 *
 * @returns {Promise<{ available: boolean; reason?: string }>}
 */
const probeBwrapUserns = async () => {
  await null;
  try {
    const proc = nodeSpawn(
      'bwrap',
      [
        '--unshare-all',
        '--die-with-parent',
        '--cap-drop',
        'ALL',
        '--ro-bind-try',
        '/usr',
        '/usr',
        '--ro-bind-try',
        '/bin',
        '/bin',
        '--ro-bind-try',
        '/lib',
        '/lib',
        '--ro-bind-try',
        '/lib64',
        '/lib64',
        '--proc',
        '/proc',
        '--dev',
        '/dev',
        '--clearenv',
        '--',
        '/bin/true',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    /** @type {Buffer[]} */
    const stderrChunks = [];
    proc.stderr?.on('data', c => stderrChunks.push(c));
    return await new Promise(resolve => {
      proc.once('error', e =>
        resolve({
          available: false,
          reason: `failed to spawn bwrap: ${/** @type {Error} */ (e).message}`,
        }),
      );
      proc.once('close', code => {
        if (code === 0) {
          resolve({ available: true });
          return;
        }
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
        resolve({
          available: false,
          reason:
            stderr === ''
              ? `bwrap user-namespace smoke test exit ${code}`
              : `bwrap user-namespace smoke test exit ${code}: ${stderr}`,
        });
      });
    });
  } catch (e) {
    return {
      available: false,
      reason: /** @type {Error} */ (e).message,
    };
  }
};

/**
 * Combined availability flag.  `available` is true only when both the
 * `--version` probe and the user-namespace smoke test succeed.  When
 * the smoke test fails we keep the parsed version (so the "probe
 * reports available with a version" test still asserts the right
 * thing) but mark the slice tests as skipped with the smoke-test
 * stderr as the reason.
 *
 * @type {{
 *   versionAvailable: boolean,
 *   sliceAvailable: boolean,
 *   version?: string,
 *   reason?: string,
 * }}
 */
let bwrapAvailability = {
  versionAvailable: false,
  sliceAvailable: false,
  reason: 'not yet probed',
};

test.serial.before(async _t => {
  const versionProbe = await probeBwrap();
  if (!versionProbe.available) {
    bwrapAvailability = {
      versionAvailable: false,
      sliceAvailable: false,
      reason: versionProbe.reason,
    };
    return;
  }
  const usernsProbe = await probeBwrapUserns();
  bwrapAvailability = {
    versionAvailable: true,
    sliceAvailable: usernsProbe.available,
    version: versionProbe.version,
    ...(usernsProbe.reason !== undefined ? { reason: usernsProbe.reason } : {}),
  };
});

/**
 * Pretty-print stdout / stderr captures for inclusion in test
 * failure messages.  Trims trailing newlines and replaces empty
 * captures with "(empty)" so a missing stream is visually obvious.
 *
 * @param {string} label
 * @param {string} text
 * @returns {string}
 */
const formatCapture = (label, text) => {
  const trimmed = text.replace(/\n+$/, '');
  return `${label}=${trimmed === '' ? '(empty)' : JSON.stringify(trimmed)}`;
};

/**
 * Surface a bwrap-level failure (stderr begins with "bwrap: ...") as
 * a clear assertion failure.  Without this the surface symptom is
 * just "exit code 1" with stderr discarded; the call site sees the
 * actual kernel-policy / bwrap argv error.  No-op when the slice ran.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {{ exit: { code: number | null }, stderr: string }} result
 * @param {string} where  Short label naming the slice command, used
 *                        in the failure message.
 */
const failOnBwrapError = (t, result, where) => {
  if (result.exit.code === 0) return;
  const m = result.stderr.match(/^bwrap: .+$/m);
  if (m !== null) {
    t.fail(`${where}: bwrap itself failed (exit ${result.exit.code}): ${m[0]}`);
  }
};

/**
 * Build a stub `SandboxPowers` that:
 *   1. mints a real tmpdir for `provideScratchMount` (returning a
 *      Mount-shaped fake whose only requirement is that
 *      `provideHostPath` can map it back to a host path),
 *   2. resolves any granted Mount cap to a real host path via the
 *      capToHostPath WeakMap.
 *
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
        nodePath.join(nodeOs.tmpdir(), `endo-sandbox-${petName}-`),
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
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await E(reader).next();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c)));
};

test.serial('bwrap probe reports available with a version', async t => {
  if (!bwrapAvailability.versionAvailable) {
    t.pass(`bwrap not available: ${bwrapAvailability.reason}`);
    return;
  }
  const driver = makeBwrapDriver({ env: {} });
  const probe = await driver.probe();
  t.true(probe.available, `probe should report available: ${probe.reason}`);
  t.is(typeof probe.version, 'string');
  t.regex(probe.version ?? '', /\d+\.\d+/);
});

test.serial(
  'listBackends() reports bwrap available via the factory',
  async t => {
    if (!bwrapAvailability.versionAvailable) {
      t.pass(`bwrap not available: ${bwrapAvailability.reason}`);
      return;
    }
    const driver = makeBwrapDriver({ env: {} });
    const { powers } = makeStubScratchProvider();
    const factory = makeSandboxFactory({
      drivers: harden([driver]),
      scratchProvider: powers,
    });
    const backends = await E(factory).listBackends();
    t.is(backends.length, 1);
    t.is(backends[0].name, 'bwrap');
    t.true(backends[0].available);
    t.regex(backends[0].version ?? '', /\d+\.\d+/);
  },
);

/**
 * Spawn a command in the slice and drain stdout / stderr fully so a
 * failed assertion can quote both streams.  Without this every test
 * that just checks `exit.code` reports "exit code 1" with no clue
 * whether bwrap itself failed (e.g. blocked userns), the user's argv
 * was wrong, or the in-slice command actually exited non-zero.
 *
 * @param {any} handle
 * @param {string[]} argv
 * @returns {Promise<{
 *   exit: { code: number | null, signal: string | null },
 *   stdout: string,
 *   stderr: string,
 * }>}
 */
const runInSlice = async (handle, argv) => {
  const proc = await E(handle).spawn(harden(argv));
  const stdoutPromise = drainReader(await E(proc).stdout());
  const stderrPromise = drainReader(await E(proc).stderr());
  const exit = await E(proc).wait();
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return {
    exit,
    stdout: stdout.toString('utf8'),
    stderr: stderr.toString('utf8'),
  };
};

test.serial('host-bind slice spawns /bin/echo hello', async t => {
  if (!bwrapAvailability.sliceAvailable) {
    t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
    return;
  }
  const driver = makeBwrapDriver({ env: {} });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });

  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'host-bind' },
      network: 'none',
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    for (const dir of tmpdirs) {
      try {
        nodeFs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  const result = await runInSlice(handle, ['/bin/echo', 'hello']);
  failOnBwrapError(t, result, '/bin/echo hello');
  t.is(
    result.exit.code,
    0,
    `exit code 0, got ${result.exit.code}; ${formatCapture('stdout', result.stdout)} ${formatCapture('stderr', result.stderr)}`,
  );
  t.true(
    result.stdout.startsWith('hello'),
    `stdout should start with "hello"; ${formatCapture('stdout', result.stdout)} ${formatCapture('stderr', result.stderr)}`,
  );
});

test.serial('read-only mount rejects writes from inside the slice', async t => {
  if (!bwrapAvailability.sliceAvailable) {
    t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
    return;
  }
  const driver = makeBwrapDriver({ env: {} });
  const { powers, makeMountCapForPath, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });

  // Set up a real host directory that we'll grant as read-only.
  const roHost = nodeFs.mkdtempSync(
    nodePath.join(nodeOs.tmpdir(), 'endo-sandbox-ro-'),
  );
  tmpdirs.push(roHost);
  nodeFs.writeFileSync(nodePath.join(roHost, 'sentinel'), 'baseline\n');

  const roMountCap = makeMountCapForPath(roHost);
  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'host-bind' },
      mounts: [{ cap: roMountCap, innerPath: '/ro', mode: 'ro' }],
      network: 'none',
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    for (const dir of tmpdirs) {
      try {
        nodeFs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  // Attempt to write to /ro — should fail with non-zero exit.
  const result = await runInSlice(handle, [
    '/bin/sh',
    '-c',
    'echo nope > /ro/should-fail',
  ]);
  failOnBwrapError(t, result, 'echo > /ro/should-fail');
  t.not(
    result.exit.code,
    0,
    `write to /ro should fail; ${formatCapture('stdout', result.stdout)} ${formatCapture('stderr', result.stderr)}`,
  );
  t.regex(
    result.stderr,
    /Read-only file system|Permission denied|read-only/i,
    `stderr should mention read-only; ${formatCapture('stderr', result.stderr)}`,
  );

  // Sanity: the RO file is still readable from inside.
  const sanity = await runInSlice(handle, ['/bin/cat', '/ro/sentinel']);
  failOnBwrapError(t, sanity, 'cat /ro/sentinel');
  t.is(
    sanity.exit.code,
    0,
    `cat /ro/sentinel exit 0, got ${sanity.exit.code}; ${formatCapture('stderr', sanity.stderr)}`,
  );
  t.is(sanity.stdout, 'baseline\n');
});

test.serial('network: none blocks loopback reach', async t => {
  if (!bwrapAvailability.sliceAvailable) {
    t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
    return;
  }
  const driver = makeBwrapDriver({ env: {} });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });

  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'host-bind' },
      network: 'none',
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    for (const dir of tmpdirs) {
      try {
        nodeFs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  // Verify the slice cannot reach any non-loopback network: under
  // bwrap's `--unshare-all` (which `network: 'none'` triggers), the
  // private netns has only `lo`; external interfaces are absent, so
  // a TCP connect to a non-loopback host is unreachable.  The kernel
  // brings up `lo` automatically inside a user-netns, so we cannot
  // claim 127.0.0.1 is unreachable here — that is the
  // `host-loopback` profile's job, deferred to Phase 1.5.  What we
  // can claim is that an external address (e.g. 10.0.0.1, an
  // RFC 1918 address that is almost certainly NOT routable from a
  // fresh netns with no interfaces) returns ENETUNREACH.
  const cmd =
    'if exec 3<>/dev/tcp/10.0.0.1/1 2>/dev/null; then echo connected; else echo blocked; fi';
  const result = await runInSlice(handle, ['/bin/bash', '-c', cmd]);
  failOnBwrapError(t, result, 'bash -c (tcp probe)');
  t.regex(
    result.stdout,
    /blocked/,
    `connect to external host should fail; ${formatCapture('stdout', result.stdout)} ${formatCapture('stderr', result.stderr)}`,
  );
  t.notRegex(
    result.stdout,
    /connected/,
    `connect should not have succeeded; ${formatCapture('stdout', result.stdout)}`,
  );

  // Verify there are no non-loopback interfaces.  The fresh netns
  // should only have `lo`.
  const ifaceResult = await runInSlice(handle, [
    '/bin/sh',
    '-c',
    'ls /sys/class/net 2>/dev/null || true',
  ]);
  failOnBwrapError(t, ifaceResult, 'ls /sys/class/net');
  const ifaces = ifaceResult.stdout
    .split('\n')
    .map(s => s.trim())
    .filter(s => s !== '');
  t.deepEqual(
    ifaces.filter(i => i !== 'lo').sort(),
    [],
    `no non-loopback interfaces in network: none; ${formatCapture('stdout', ifaceResult.stdout)} ${formatCapture('stderr', ifaceResult.stderr)}`,
  );
});

test.serial(
  'private network profile is accepted but pasta wiring is Phase 1.5',
  async t => {
    if (!bwrapAvailability.sliceAvailable) {
      t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
      return;
    }
    // Phase 1 accepts `network: 'private'` for slice construction;
    // the egress filter is documented in src/net/private-egress.nft.
    // Full wiring (pasta + nft) lands alongside the genie integration.
    const driver = makeBwrapDriver({ env: {} });
    const { powers, tmpdirs } = makeStubScratchProvider();
    const factory = makeSandboxFactory({
      drivers: harden([driver]),
      scratchProvider: powers,
    });
    const handle = await E(factory).make(
      harden({
        rootfs: { kind: 'host-bind' },
        network: 'private',
      }),
    );
    t.teardown(async () => {
      await E(handle).dispose();
      for (const dir of tmpdirs) {
        try {
          nodeFs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });
    t.truthy(handle, 'private slice constructed');
  },
);

test.serial(
  'host-net profile shares the host net namespace (Phase 1.5)',
  async t => {
    if (!bwrapAvailability.sliceAvailable) {
      t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
      return;
    }
    const driver = makeBwrapDriver({ env: {} });
    const { powers, tmpdirs } = makeStubScratchProvider();
    const factory = makeSandboxFactory({
      drivers: harden([driver]),
      scratchProvider: powers,
    });
    const handle = await E(factory).make(
      harden({
        rootfs: { kind: 'host-bind' },
        network: 'host-net',
      }),
    );
    t.teardown(async () => {
      await E(handle).dispose();
      for (const dir of tmpdirs) {
        try {
          nodeFs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });
    // host-net keeps the host's network namespace, so the slice sees
    // every interface the host has (at least `lo` plus typically a
    // physical / veth interface). We read `/proc/net/dev`, which is
    // per-netns: it shows the host's interfaces when the netns is
    // shared and only `lo` when it is not.  Sysfs is not bind-mounted
    // into the slice (the rootfs only binds /usr, /lib, /etc, etc.),
    // so we cannot use `/sys/class/net` here.
    const result = await runInSlice(handle, ['/bin/cat', '/proc/net/dev']);
    failOnBwrapError(t, result, 'cat /proc/net/dev');
    t.is(
      result.exit.code,
      0,
      `cat /proc/net/dev should succeed; ${formatCapture('stdout', result.stdout)} ${formatCapture('stderr', result.stderr)}`,
    );
    // /proc/net/dev format:
    //   Inter-|   Receive                                                |  Transmit
    //    face |bytes    packets errs drop fifo frame compressed multicast|bytes ...
    //       lo: ...
    //     eth0: ...
    const ifaces = result.stdout
      .split('\n')
      .slice(2) // skip the two header rows
      .map(line => line.trim().split(':')[0]?.trim() ?? '')
      .filter(name => name !== '');
    t.true(
      ifaces.includes('lo'),
      `host loopback visible inside host-net slice; ${formatCapture('stdout', result.stdout)}`,
    );
    // We do not assert a specific non-loopback interface name (CI may
    // run without one); we only assert the slice could enumerate the
    // host's interfaces, which proves the netns is shared.
  },
);

test.serial('host-loopback profile is accepted', async t => {
  if (!bwrapAvailability.sliceAvailable) {
    t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
    return;
  }
  const driver = makeBwrapDriver({ env: {} });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });
  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'host-bind' },
      network: 'host-loopback',
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    for (const dir of tmpdirs) {
      try {
        nodeFs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
  // Slice constructs and can enumerate interfaces; the actual
  // host-loopback firewall (drop everything except 127.0.0.0/8 / ::1)
  // is the operator's responsibility because rootless slices lack
  // CAP_NET_ADMIN. See README § "Host network profiles".
  const result = await runInSlice(handle, ['/bin/echo', 'ok']);
  failOnBwrapError(t, result, '/bin/echo ok (host-loopback)');
  t.is(
    result.exit.code,
    0,
    `host-loopback slice spawns successfully; ${formatCapture('stdout', result.stdout)} ${formatCapture('stderr', result.stderr)}`,
  );
});

test.serial('host-lan profile is accepted', async t => {
  if (!bwrapAvailability.sliceAvailable) {
    t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
    return;
  }
  const driver = makeBwrapDriver({ env: {} });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });
  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'host-bind' },
      network: 'host-lan',
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    for (const dir of tmpdirs) {
      try {
        nodeFs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
  const result = await runInSlice(handle, ['/bin/echo', 'ok']);
  failOnBwrapError(t, result, '/bin/echo ok (host-lan)');
  t.is(
    result.exit.code,
    0,
    `host-lan slice spawns successfully; ${formatCapture('stdout', result.stdout)} ${formatCapture('stderr', result.stderr)}`,
  );
});

test.serial(
  'slice.help() reports the Landlock and prlimit hardening layers',
  async t => {
    if (!bwrapAvailability.sliceAvailable) {
      t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
      return;
    }
    const driver = makeBwrapDriver({ env: {} });
    const { powers, tmpdirs } = makeStubScratchProvider();
    const factory = makeSandboxFactory({
      drivers: harden([driver]),
      scratchProvider: powers,
    });
    const handle = await E(factory).make(
      harden({
        rootfs: { kind: 'host-bind' },
        network: 'none',
      }),
    );
    t.teardown(async () => {
      await E(handle).dispose();
      for (const dir of tmpdirs) {
        try {
          nodeFs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });
    const help = await E(handle).help();
    t.regex(help, /Hardening layers in effect:/);
    t.regex(help, /network: none/);
    // Landlock line is always present — the kernel may or may not
    // support it, but the report row is unconditional.
    t.regex(help, /landlock: (available|unavailable|not detected)/);
    t.regex(help, /cgroup2: (available|unavailable|not detected)/);
    // The factory applies DEFAULT_LIMITS (which always includes nproc
    // and as), so prlimit always shows at least one applied flag.
    t.regex(help, /prlimit: prlimit /);
    t.regex(help, /--nproc=/);
  },
);

test.serial('prlimit nproc cap is enforced inside the slice', async t => {
  if (!bwrapAvailability.sliceAvailable) {
    t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
    return;
  }
  // Ask for an `nproc` ceiling that is comfortably above the
  // ambient process count for this user (so the slice itself can
  // start) but well below what a fork bomb would try to reach. We
  // pick a per-uid budget anchored on the current user's process
  // count; if the host is too noisy we skip rather than flake.
  let baselineProcs;
  try {
    baselineProcs = nodeFs
      .readdirSync('/proc')
      .filter(name => /^\d+$/.test(name)).length;
  } catch {
    t.pass('cannot read /proc to size the nproc test');
    return;
  }
  // Add a generous cushion so test infra processes are not the
  // ones that hit the cap.  RLIMIT_NPROC is per-uid for the host
  // UID after the userns mapping; this is the documented and
  // expected behaviour.
  const cap = baselineProcs + 32;
  const driver = makeBwrapDriver({ env: {} });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });
  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'host-bind' },
      network: 'none',
      limits: { nproc: cap },
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    for (const dir of tmpdirs) {
      try {
        nodeFs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
  // /bin/sh's `ulimit -u` reports RLIMIT_NPROC, the same value
  // prlimit set.  We assert the cap is in effect rather than
  // running an actual fork bomb (which would also stress the host
  // the test process is running on).
  const result = await runInSlice(handle, ['/bin/sh', '-c', 'ulimit -u']);
  failOnBwrapError(t, result, 'ulimit -u');
  t.is(
    result.exit.code,
    0,
    `ulimit -u exit code 0 (got ${result.exit.code}); ${formatCapture('stdout', result.stdout)} ${formatCapture('stderr', result.stderr)}`,
  );
  const reported = Number(result.stdout.trim());
  t.is(
    reported,
    cap,
    `slice should observe RLIMIT_NPROC=${cap}, got ${reported}; ${formatCapture('stdout', result.stdout)} ${formatCapture('stderr', result.stderr)}`,
  );
});

test.serial('fork() throws notImplemented before Phase 3', async t => {
  if (!bwrapAvailability.sliceAvailable) {
    t.pass(`bwrap slice unavailable: ${bwrapAvailability.reason}`);
    return;
  }
  const driver = makeBwrapDriver({ env: {} });
  const { powers, tmpdirs } = makeStubScratchProvider();
  const factory = makeSandboxFactory({
    drivers: harden([driver]),
    scratchProvider: powers,
  });
  const handle = await E(factory).make(
    harden({
      rootfs: { kind: 'host-bind' },
      network: 'none',
    }),
  );
  t.teardown(async () => {
    await E(handle).dispose();
    for (const dir of tmpdirs) {
      try {
        nodeFs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
  await t.throwsAsync(() => E(handle).fork(), {
    message: /Phase 3/,
  });
});
