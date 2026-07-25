// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

import '@endo/init';
import test from 'ava';

import { execFile } from 'node:child_process';
import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { make as makeSandboxAgent } from '@endo/sandbox';

// Imported by relative monorepo path: neither subpath is in its package's
// `exports` map, and adding a dependency edge just for a probe is noise.
/* eslint-disable import/no-relative-packages */
import { make as makeFsMounter } from '../../9p-server/mount-caplet.js';
import { makeNodeFilesystem } from '../../platform/src/fs/extended/node-fs.js';
/* eslint-enable import/no-relative-packages */

import { parseStreamJsonLines } from '../src/claude-client.js';

// End-to-end probe of the "plan B" workspace projection — the real path
// no other automated test exercises (mount-caplet.test.js fakes mount(2);
// integration.test.js bind-mounts a plain tmpdir, skipping 9P entirely):
//
//   Filesystem cap → `mount -t 9p` on the host → podman bind → read inside
//   the container.
//
// It is gated on a host that can actually 9P-mount (Linux + CONFIG_9P_FS +
// mount privilege) and run podman. Set NINEP_REQUIRE=1 to turn "cannot
// run" into a hard failure (CI sets it so a missing capability is a red
// result we can read on the matrix, not a silent green).

const ALPINE_REF = 'docker.io/library/alpine:3.19';
const WORKSPACE_FILE = 'events.ndjson';
const WORKSPACE_CONTENT =
  '{"type":"system","subtype":"init"}\n{"type":"result","is_error":false}\n';

const StubMountInterface = M.interface('Mount', {
  help: M.call().returns(M.string()),
  hostPath: M.call().returns(M.string()),
});

/**
 * Run a host program and capture its stdio (never rejects).
 * @param file
 * @param args
 */
const run = async (file, args) => {
  await null;
  return new Promise(resolve => {
    let child;
    try {
      child = execFile(file, args, (error, stdout, stderr) =>
        resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr }),
      );
    } catch (e) {
      resolve({ code: 127, stdout: '', stderr: e.message });
      return;
    }
    child.once('error', e =>
      resolve({ code: 127, stdout: '', stderr: e.message }),
    );
  });
};

/**
 * Probe whether this host can perform the host-side 9P mount: the kernel
 * must list `9p` in /proc/filesystems (after a best-effort modprobe) and
 * we must be able to mount(2) — here via passwordless sudo, matching the
 * NINEP_SUDO=1 operator posture.
 */
const probeNineP = async () => {
  if (process.platform !== 'linux') {
    return { ok: false, reason: `not linux (${process.platform})` };
  }
  // Best-effort: load the v9fs modules. Ignored if already built-in or if
  // we lack privilege — the /proc/filesystems check below is the verdict.
  await run('sudo', ['modprobe', '9p', '9pnet', '9pnet_virtio']);
  let filesystems = '';
  try {
    filesystems = nodeFs.readFileSync('/proc/filesystems', 'utf8');
  } catch {
    // ignore
  }
  if (!/\b9p\b/.test(filesystems)) {
    return {
      ok: false,
      reason: 'no 9p in /proc/filesystems (no CONFIG_9P_FS)',
    };
  }
  const sudo = await run('sudo', ['-n', 'true']);
  if (sudo.code !== 0) {
    return { ok: false, reason: 'no passwordless sudo for mount(2)' };
  }
  return { ok: true };
};

const probePodman = async () => {
  const version = await run('podman', ['--version']);
  if (version.code !== 0) {
    return { ok: false, reason: `podman --version exit ${version.code}` };
  }
  const imageExists = await run('podman', ['image', 'exists', ALPINE_REF]);
  return { ok: true, imagePresent: imageExists.code === 0 };
};

/** A scratch provider that resolves a stub Mount cap to a fixed host path. */
const makeScratchProvider = () => {
  const capToHostPath = new WeakMap();
  const wrap = hostPath => {
    const cap = makeExo('Mount', StubMountInterface, {
      help: () => `stub Mount @ ${hostPath}`,
      hostPath: () => hostPath,
    });
    capToHostPath.set(cap, hostPath);
    return cap;
  };
  const tmpdirs = [];
  const powers = harden({
    provideScratchMount: async petName => {
      const dir = nodeFs.mkdtempSync(
        nodePath.join(nodeOs.tmpdir(), `ninep-scratch-${petName}-`),
      );
      tmpdirs.push(dir);
      return wrap(dir);
    },
    provideHostPath: async cap => {
      const path = capToHostPath.get(cap);
      if (path === undefined) throw new Error('unknown Mount cap');
      return path;
    },
  });
  return { powers, wrap, tmpdirs };
};

/** @type {{ ok: boolean, reason?: string }} */
let ninep = { ok: false, reason: 'not yet probed' };
/** @type {{ ok: boolean, imagePresent?: boolean, reason?: string }} */
let podman = { ok: false, reason: 'not yet probed' };

test.before(async () => {
  ninep = await probeNineP();
  podman = await probePodman();
  // Surface the verdict in the job log regardless of gating.
  // eslint-disable-next-line no-console
  console.error(
    `[ninep-flow] platform=${process.platform} ninep=${JSON.stringify(ninep)} podman=${JSON.stringify(podman)}`,
  );
});

const required = () => process.env.NINEP_REQUIRE === '1';

const seedWorkspace = (tmpdirs, name) => {
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), `${name}-`));
  tmpdirs.push(dir);
  nodeFs.writeFileSync(nodePath.join(dir, WORKSPACE_FILE), WORKSPACE_CONTENT);
  return dir;
};

test.serial(
  'a Filesystem cap mounts over real kernel 9P and reads back through the mountpoint',
  async t => {
    t.timeout(60_000);
    if (!ninep.ok) {
      const why = `9P mount unavailable: ${ninep.reason}`;
      if (required()) t.fail(why);
      else t.pass(why);
      return;
    }

    /** @type {string[]} */
    const tmpdirs = [];
    t.teardown(() => {
      for (const dir of tmpdirs) {
        try {
          nodeFs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });

    const srcDir = seedWorkspace(tmpdirs, 'ninep-src');
    const fs = makeNodeFilesystem({ rootPath: srcDir });

    const mounter = await makeFsMounter(null, null, {
      env: { NINEP_SUDO: '1' },
    });
    const mountPoint = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'ninep-mnt-'),
    );
    tmpdirs.push(mountPoint);

    const handle = await E(mounter).mount(
      fs,
      mountPoint,
      harden({ lazyUnmount: true }),
    );
    t.teardown(() => E(handle).unmount());

    // The real verdict: a read of the mountpoint path round-trips through
    // the kernel's v9fs client to the bridge serving the Filesystem cap.
    //
    // MUST be async. The bridge serving this mount runs in *this* Node
    // process's event loop; a synchronous `readFileSync` would block that
    // loop on the kernel's Tread, the bridge could never answer, and the
    // read would deadlock. `fs.promises.readFile` runs the blocking read(2)
    // on the libuv threadpool, leaving the main loop free to service the
    // bridge.
    const readBack = await nodeFs.promises.readFile(
      nodePath.join(mountPoint, WORKSPACE_FILE),
      'utf8',
    );
    t.is(readBack, WORKSPACE_CONTENT, 'file content read back through 9P');
  },
);

test.serial(
  'the full 9P sandbox flow: Filesystem cap → host 9P mount → podman bind → read inside the container',
  async t => {
    t.timeout(120_000);
    if (!ninep.ok || !podman.ok || !podman.imagePresent) {
      const why = !ninep.ok
        ? `9P mount unavailable: ${ninep.reason}`
        : !podman.ok
          ? `podman unavailable: ${podman.reason}`
          : `image ${ALPINE_REF} not present`;
      if (required()) t.fail(why);
      else t.pass(why);
      return;
    }

    /** @type {string[]} */
    const tmpdirs = [];
    t.teardown(() => {
      for (const dir of tmpdirs) {
        try {
          nodeFs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });

    const srcDir = seedWorkspace(tmpdirs, 'ninep-flow-src');
    const fs = makeNodeFilesystem({ rootPath: srcDir });

    // 1. Host-side 9P mount of the Filesystem cap.
    const mounter = await makeFsMounter(null, null, {
      env: { NINEP_SUDO: '1' },
    });
    const mountPoint = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'ninep-flow-mnt-'),
    );
    tmpdirs.push(mountPoint);
    const handle = await E(mounter).mount(
      fs,
      mountPoint,
      harden({ lazyUnmount: true }),
    );
    t.teardown(() => E(handle).unmount());

    // 2. Project the 9P mountpoint into a podman slice. The stub scratch
    //    provider stands in for the daemon's provideMount/provideHostPath
    //    (host.js), resolving the workspace Mount cap to the 9P mountpoint
    //    exactly as the daemon does — the part this probe does not need a
    //    live daemon for.
    const { powers, wrap, tmpdirs: scratchDirs } = makeScratchProvider();
    scratchDirs.forEach(d => tmpdirs.push(d));
    const factory = await makeSandboxAgent(powers, null, {});
    const workspaceCap = wrap(mountPoint);

    const slice = await E(factory).make(
      harden({
        rootfs: { kind: 'oci', ref: ALPINE_REF },
        mounts: [{ cap: workspaceCap, innerPath: '/workspace', mode: 'rw' }],
        network: 'none',
        env: {},
        cwd: '/workspace',
        backend: 'podman',
      }),
    );
    t.teardown(() => E(slice).dispose());

    // 3. Read the 9P-projected file from inside the container, as
    //    stream-json — the same wire the ClaudeClient reader consumes.
    const proc = await E(slice).spawn(
      harden(['/bin/sh', '-c', `cat /workspace/${WORKSPACE_FILE}`]),
      harden({ cwd: '/workspace', captureStdout: true, captureStderr: true }),
    );

    const events = [];
    const stdout = harden({
      async *[Symbol.asyncIterator]() {
        const stdoutRef = await E(proc).stdout();
        yield* iterateBytesReader(stdoutRef);
      },
    });
    for await (const event of parseStreamJsonLines(stdout)) {
      events.push(event);
    }
    t.deepEqual(
      events,
      [
        { type: 'system', subtype: 'init' },
        { type: 'result', is_error: false },
      ],
      'the 9P-projected workspace file is readable inside the container',
    );
  },
);
