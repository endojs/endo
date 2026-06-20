// @ts-nocheck
/* global setTimeout */

/**
 * Unit tests for the mount caplet's mounter logic, exercised through
 * the injectable `makeFsMounter({ runProgram, makeDir, removeDir,
 * makeBridge })` seam so the privileged `mount(2)` path runs with fakes
 * — no root, no real kernel, no real 9P bridge.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E, Far } from '@endo/far';

import { makeFsMounter } from '../mount-caplet.js';

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
    harden({ socketPath: '/tmp/s.sock' }),
  );

  t.deepEqual(calls.makeDir[0], { p: '/mnt/x', o: { recursive: true } });
  t.is(calls.bridges.length, 1);
  t.is(calls.bridges[0].socketPath, '/tmp/s.sock');
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
  t.is(argv[5], '/tmp/s.sock');
  t.is(argv[6], '/mnt/x');

  t.is(await E(h).mountPoint(), '/mnt/x');
  t.is(await E(h).socketPath(), '/tmp/s.sock');
  t.is((await E(mounter).list()).length, 1);
});

test('readOnly, msize override, and extraMountOptions reach the -o string', async t => {
  const { mounter, calls } = makeHarness();
  await E(mounter).mount(
    fakeFs(),
    '/mnt/x',
    harden({
      socketPath: '/tmp/s.sock',
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
    harden({ socketPath: '/tmp/s.sock' }),
  );
  t.is(calls.run[0].bin, 'sudo');
  t.is(calls.run[0].argv[0], 'mount');
  await E(h).unmount();
  const umount = calls.run.find(
    c => c.bin === 'sudo' && c.argv[0] === 'umount',
  );
  t.truthy(umount);
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
    E(mounter).mount(fakeFs(), '/mnt/x', harden({ socketPath: '/tmp/s.sock' })),
    { message: /9p mount of .* failed/ },
  );
  t.is(calls.bridges[0].stopped, 1);
  t.is((await E(mounter).list()).length, 0);
});

test('unmount detaches with `umount -- <mp>`, stops the bridge, drops the handle', async t => {
  const { mounter, calls } = makeHarness();
  const h = await E(mounter).mount(
    fakeFs(),
    '/mnt/x',
    harden({ socketPath: '/tmp/s.sock' }),
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
    harden({ socketPath: '/tmp/s.sock' }),
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
    harden({ socketPath: '/tmp/s.sock', lazyUnmount: true }),
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
  await E(mounter).mount(
    fakeFs(),
    '/mnt/x',
    harden({ socketPath: '/tmp/s.sock' }),
  );

  rejectCancelled(new Error('teardown'));
  await flush();

  t.truthy(calls.run.find(c => c.bin === 'umount'));
  t.is(calls.bridges[0].stopped, 1);
  t.is((await E(mounter).list()).length, 0);

  await t.throwsAsync(
    E(mounter).mount(
      fakeFs(),
      '/mnt/y',
      harden({ socketPath: '/tmp/s2.sock' }),
    ),
    { message: /cancelled/ },
  );
});
