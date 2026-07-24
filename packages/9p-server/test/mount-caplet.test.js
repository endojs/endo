// @ts-nocheck

/**
 * Unit tests for the mount caplet's mounter logic, exercised through
 * the injectable `makeFsMounter({ runProgram, makeDir, removeDir,
 * makeBridge })` seam so the privileged `mount(2)` path runs with fakes
 * — no root, no real kernel, no real 9P bridge.
 */

import '@endo/init/debug.js';

import test from 'ava';
import os from 'node:os';
import nodePath from 'node:path';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';

import { makeFsMounter } from '../mount-caplet.js';

// A caller-supplied socketPath must live inside the socket directory
// (defaults to os.tmpdir() when XDG_RUNTIME_DIR is unset), so build the
// test paths there rather than hard-coding `/tmp`.
const SOCK = nodePath.join(os.tmpdir(), 's.sock');
const SOCK2 = nodePath.join(os.tmpdir(), 's2.sock');

const fakeFs = () => Far('FakeFs', {});

const flush = () => new Promise(resolve => setTimeout(resolve, 10));

/**
 * @param {object} [opts]
 * @param {Record<string, string>} [opts.env]
 * @param {Promise<never>} [opts.cancelledP]
 * @param {(bin: string, argv: string[], nth: number) => Promise<unknown>} [opts.runBehavior]
 */
const makeHarness = (opts = {}) => {
  const calls = { run: [], makeDir: [], removeDir: [], bridges: [] };
  const runBehavior =
    opts.runBehavior ?? (() => Promise.resolve({ stdout: '', stderr: '' }));
  const runProgram = (bin, argv) => {
    calls.run.push({ bin, argv });
    return runBehavior(bin, argv, calls.run.length);
  };
  const makeDir = (p, o) => {
    calls.makeDir.push({ p, o });
    return Promise.resolve();
  };
  const removeDir = p => {
    calls.removeDir.push(p);
    return Promise.resolve();
  };
  const makeBridge = ({ fs, socketPath, cancelled }) => {
    const rec = { fs, socketPath, cancelled, started: 0, stopped: 0 };
    calls.bridges.push(rec);
    return Far('FakeBridge', {
      async start() {
        rec.started += 1;
      },
      async stop() {
        rec.stopped += 1;
      },
    });
  };
  const mounter = makeFsMounter({
    env: opts.env ?? {},
    cancelledP: opts.cancelledP ?? null,
    runProgram,
    makeDir,
    removeDir,
    makeBridge,
  });
  return { mounter, calls };
};

test('mount builds the 9P mount argv, makes the dir, and starts the bridge', async t => {
  const { mounter, calls } = makeHarness();
  const h = await E(mounter).mount(
    fakeFs(),
    '/mnt/x',
    harden({ socketPath: SOCK }),
  );

  t.deepEqual(calls.makeDir[0], { p: '/mnt/x', o: { recursive: true } });
  t.is(calls.bridges.length, 1);
  t.is(calls.bridges[0].socketPath, SOCK);
  t.is(calls.bridges[0].started, 1);

  t.is(calls.run.length, 1);
  t.is(calls.run[0].bin, 'mount');
  const argv = calls.run[0].argv;
  t.deepEqual(argv.slice(0, 3), ['-t', '9p', '-o']);
  const optionString = argv[3];
  for (const part of [
    'trans=unix',
    'version=9p2000.L',
    'msize=131072',
    'access=any',
    'cache=none',
  ]) {
    t.true(optionString.includes(part), `option string has ${part}`);
  }
  // `--` terminates options so a dash-leading path can't be a flag.
  t.is(argv[4], '--');
  t.is(argv[5], SOCK);
  t.is(argv[6], '/mnt/x');

  t.is(await E(h).mountPoint(), '/mnt/x');
  t.is(await E(h).socketPath(), SOCK);
  t.is((await E(mounter).list()).length, 1);
});

test('readOnly, msize override, and extraMountOptions reach the -o string', async t => {
  const { mounter, calls } = makeHarness();
  await E(mounter).mount(
    fakeFs(),
    '/mnt/x',
    harden({
      socketPath: SOCK,
      readOnly: true,
      msize: 65_536,
      extraMountOptions: 'cache=loose',
    }),
  );
  const optionString = calls.run[0].argv[3];
  t.true(optionString.includes('msize=65536'));
  t.true(optionString.split(',').includes('ro'));
  t.true(optionString.includes('cache=loose'));
});

test('NINEP_SUDO routes mount/umount through sudo', async t => {
  const { mounter, calls } = makeHarness({ env: { NINEP_SUDO: '1' } });
  const h = await E(mounter).mount(
    fakeFs(),
    '/mnt/x',
    harden({ socketPath: SOCK }),
  );
  t.is(calls.run[0].bin, 'sudo');
  t.is(calls.run[0].argv[0], 'mount');
  await E(h).unmount();
  const umount = calls.run.find(
    c => c.bin === 'sudo' && c.argv[0] === 'umount',
  );
  t.truthy(umount);
});

test('extraMountOptions cannot override the pinned trans option', async t => {
  const { mounter } = makeHarness();
  await t.throwsAsync(
    E(mounter).mount(
      fakeFs(),
      '/mnt/x',
      harden({
        socketPath: SOCK,
        extraMountOptions: 'trans=tcp,port=564',
      }),
    ),
    { message: /may not set the pinned option .*trans/ },
  );
});

test('caller cannot choose the mount/umount program', async t => {
  const { mounter } = makeHarness();
  await t.throwsAsync(
    E(mounter).mount(
      fakeFs(),
      '/mnt/x',
      harden({ socketPath: SOCK, umountProgram: ['rm'] }),
    ),
    { message: /operator configuration/ },
  );
});

test('a socketPath outside the socket directory is rejected', async t => {
  const { mounter } = makeHarness();
  await t.throwsAsync(
    E(mounter).mount(
      fakeFs(),
      '/mnt/x',
      harden({ socketPath: '/etc/evil.sock' }),
    ),
    { message: /must be inside the socket directory/ },
  );
});

test('NINEP_MOUNT_PROGRAM lets the operator set a custom helper', async t => {
  const { mounter, calls } = makeHarness({
    env: {
      NINEP_MOUNT_PROGRAM: 'sudo -u svc mount',
      NINEP_UMOUNT_PROGRAM: 'sudo umount',
    },
  });
  await E(mounter).mount(fakeFs(), '/mnt/x', harden({ socketPath: SOCK }));
  t.is(calls.run[0].bin, 'sudo');
  t.deepEqual(calls.run[0].argv.slice(0, 3), ['-u', 'svc', 'mount']);
});

test('a NINEP_MOUNT_PROGRAM that does not run mount is rejected at construction', t => {
  t.throws(
    () =>
      makeFsMounter({
        env: { NINEP_MOUNT_PROGRAM: 'rm -rf' },
        runProgram: () => Promise.resolve(),
        makeDir: () => Promise.resolve(),
        removeDir: () => Promise.resolve(),
        makeBridge: () =>
          Far('B', { start: async () => {}, stop: async () => {} }),
      }),
    { message: /must invoke .*mount/ },
  );
});

test('a failed mount stops the bridge and leaks no handle', async t => {
  const { mounter, calls } = makeHarness({
    runBehavior: bin =>
      bin === 'mount'
        ? Promise.reject(
            Object.assign(new Error('mount: permission denied'), {
              stderr: 'only root',
            }),
          )
        : Promise.resolve(),
  });
  await t.throwsAsync(
    E(mounter).mount(fakeFs(), '/mnt/x', harden({ socketPath: SOCK })),
    { message: /9p mount of .* failed/ },
  );
  t.is(calls.bridges[0].stopped, 1);
  t.is((await E(mounter).list()).length, 0);
});

test('a failed bridge.start() is cleaned up and leaks no handle', async t => {
  const calls = { run: [], bridges: [] };
  const makeBridge = ({ fs, socketPath }) => {
    const rec = { fs, socketPath, started: 0, stopped: 0 };
    calls.bridges.push(rec);
    return Far('FakeBridge', {
      async start() {
        rec.started += 1;
        throw new Error('EADDRINUSE: socket already in use');
      },
      async stop() {
        rec.stopped += 1;
      },
    });
  };
  const mounter = makeFsMounter({
    runProgram: (bin, argv) => {
      calls.run.push({ bin, argv });
      return Promise.resolve();
    },
    makeDir: () => Promise.resolve(),
    removeDir: () => Promise.resolve(),
    makeBridge,
  });
  await t.throwsAsync(
    E(mounter).mount(fakeFs(), '/mnt/x', harden({ socketPath: SOCK })),
    { message: /bridge failed to start/ },
  );
  t.is(calls.bridges[0].stopped, 1, 'bridge stopped after start() failure');
  t.is(calls.run.length, 0, 'mount never attempted');
  t.is((await E(mounter).list()).length, 0, 'no handle leaked');
});

test('cancellation during an in-flight mount unmounts it (no orphan)', async t => {
  let rejectCancelled;
  const cancelledP = new Promise((_resolve, reject) => {
    rejectCancelled = reject;
  });
  cancelledP.catch(() => {});
  // Fire teardown *during* the mount shell-out and let its sweep run
  // before mount() resumes — the deterministic version of the
  // "settle between the last await and handles.add" race.
  const { mounter, calls } = makeHarness({
    cancelledP,
    runBehavior: async bin => {
      if (bin === 'mount') {
        rejectCancelled(new Error('teardown'));
        await flush();
      }
    },
  });
  await t.throwsAsync(
    E(mounter).mount(fakeFs(), '/mnt/x', harden({ socketPath: SOCK })),
    { message: /cancelled during mount/ },
  );
  t.truthy(
    calls.run.find(c => c.bin === 'umount'),
    'the mount was unmounted',
  );
  t.is(calls.bridges[0].stopped, 1, 'bridge stopped');
  t.is((await E(mounter).list()).length, 0, 'no orphan handle');
});

test('unmount detaches with `umount -- <mp>`, stops the bridge, drops the handle', async t => {
  const { mounter, calls } = makeHarness();
  const h = await E(mounter).mount(
    fakeFs(),
    '/mnt/x',
    harden({ socketPath: SOCK }),
  );
  await E(h).unmount();
  const umount = calls.run.find(c => c.bin === 'umount');
  t.deepEqual(umount.argv, ['--', '/mnt/x']);
  t.is(calls.bridges[0].stopped, 1);
  t.is((await E(mounter).list()).length, 0);
});

test('a failed umount (EBUSY) keeps the bridge up and the handle, and is retryable', async t => {
  let umountAttempts = 0;
  const { mounter, calls } = makeHarness({
    runBehavior: bin => {
      if (bin === 'umount') {
        umountAttempts += 1;
        if (umountAttempts === 1) {
          return Promise.reject(
            Object.assign(new Error('target is busy'), { stderr: 'EBUSY' }),
          );
        }
      }
      return Promise.resolve();
    },
  });
  const h = await E(mounter).mount(
    fakeFs(),
    '/mnt/x',
    harden({ socketPath: SOCK }),
  );
  await t.throwsAsync(E(h).unmount(), { message: /busy/ });
  // The mount must not outlive its transport: bridge still up, handle retained.
  t.is(calls.bridges[0].stopped, 0);
  t.is((await E(mounter).list()).length, 1);
  // Retry succeeds.
  await E(h).unmount();
  t.is(calls.bridges[0].stopped, 1);
  t.is((await E(mounter).list()).length, 0);
});

test('lazyUnmount adds -l to the umount argv', async t => {
  const { mounter, calls } = makeHarness();
  const h = await E(mounter).mount(
    fakeFs(),
    '/mnt/x',
    harden({ socketPath: SOCK, lazyUnmount: true }),
  );
  await E(h).unmount();
  const umount = calls.run.find(c => c.bin === 'umount');
  t.deepEqual(umount.argv, ['-l', '--', '/mnt/x']);
});

test('default socket paths are distinct across concurrent-ish mounts', async t => {
  const { mounter } = makeHarness();
  const h1 = await E(mounter).mount(fakeFs(), '/mnt/a', harden({}));
  const h2 = await E(mounter).mount(fakeFs(), '/mnt/b', harden({}));
  t.not(await E(h1).socketPath(), await E(h2).socketPath());
});

test('cancellation unmounts live mounts and refuses new ones', async t => {
  let rejectCancelled;
  const cancelledP = new Promise((_resolve, reject) => {
    rejectCancelled = reject;
  });
  cancelledP.catch(() => {});
  const { mounter, calls } = makeHarness({ cancelledP });
  await E(mounter).mount(fakeFs(), '/mnt/x', harden({ socketPath: SOCK }));

  rejectCancelled(new Error('teardown'));
  await flush();

  t.truthy(calls.run.find(c => c.bin === 'umount'));
  t.is(calls.bridges[0].stopped, 1);
  t.is((await E(mounter).list()).length, 0);

  await t.throwsAsync(
    E(mounter).mount(fakeFs(), '/mnt/y', harden({ socketPath: SOCK2 })),
    { message: /cancelled/ },
  );
});
