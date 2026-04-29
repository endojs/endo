// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import {
  DEFAULT_LIMITS,
  PRLIMIT_FLAGS,
  assemblePrlimitArgv,
  makeCgroup2Probe,
  resolveLimits,
} from '../src/limits.js';

/**
 * Phase 1.5 unit tests for the resource-cap helpers.  These run
 * everywhere; they touch only pure JS and (for the cgroup probe) a
 * stub `fs` so non-Linux CI runners stay green.
 */

test('DEFAULT_LIMITS is hardened and exposes the expected knobs', t => {
  t.true(Object.isFrozen(DEFAULT_LIMITS));
  t.is(typeof DEFAULT_LIMITS.as, 'number');
  t.is(typeof DEFAULT_LIMITS.nproc, 'number');
  t.is(typeof DEFAULT_LIMITS.nofile, 'number');
  t.is(DEFAULT_LIMITS.core, 0, 'core dumps disabled by default');
});

test('PRLIMIT_FLAGS maps every documented limit to a long flag', t => {
  for (const key of ['as', 'cpu', 'nproc', 'nofile', 'fsize', 'core']) {
    const flag = /** @type {Record<string, string>} */ (PRLIMIT_FLAGS)[key];
    t.regex(flag, /^--/, `${key} → long flag`);
  }
});

test('resolveLimits merges overrides on top of defaults', t => {
  const merged = resolveLimits({ nproc: 64, fsize: 1_000_000 });
  t.is(merged.nproc, 64, 'caller override wins');
  t.is(merged.fsize, 1_000_000, 'previously-undefined override applied');
  t.is(merged.as, DEFAULT_LIMITS.as, 'default preserved when not overridden');
  t.is(merged.core, 0, 'core stays 0 by default');
});

test('resolveLimits with no overrides returns the defaults', t => {
  const merged = resolveLimits();
  t.is(merged.as, DEFAULT_LIMITS.as);
  t.is(merged.nproc, DEFAULT_LIMITS.nproc);
  t.is(merged.nofile, DEFAULT_LIMITS.nofile);
  t.is(merged.core, DEFAULT_LIMITS.core);
});

test('assemblePrlimitArgv emits a prlimit prefix in deterministic order', t => {
  const argv = assemblePrlimitArgv({
    as: 4_000_000_000,
    nproc: 512,
    nofile: 4096,
    core: 0,
  });
  t.is(argv[0], 'prlimit', 'first token is prlimit');
  // Order follows PRLIMIT_FLAGS object key order so the argv is a
  // stable function of its input — important for the slice.help()
  // diagnostic line and for test snapshots.
  t.deepEqual(argv.slice(1), [
    '--as=4000000000',
    '--nproc=512',
    '--nofile=4096',
    '--core=0',
  ]);
});

test('assemblePrlimitArgv returns [] when no caps are set', t => {
  const argv = assemblePrlimitArgv({});
  t.deepEqual(argv, [], 'empty input ⇒ empty argv ⇒ no prlimit wrap');
});

test('assemblePrlimitArgv skips negative / NaN entries', t => {
  const argv = assemblePrlimitArgv({
    as: -1,
    nproc: Number.NaN,
    nofile: 4096,
  });
  t.deepEqual(argv, ['prlimit', '--nofile=4096']);
});

test('makeCgroup2Probe reports unavailable when /proc/self/cgroup is missing', async t => {
  const probe = makeCgroup2Probe({
    fs: {
      readFile: async () => {
        const e = /** @type {Error & { code?: string }} */ (
          new Error('ENOENT')
        );
        e.code = 'ENOENT';
        throw e;
      },
    },
  });
  const result = await probe.probe();
  t.false(result.available);
  t.deepEqual(result.controllers, []);
  t.regex(result.reason ?? '', /cannot read \/proc\/self\/cgroup/);
});

test('makeCgroup2Probe reports unavailable when not in a v2 hierarchy', async t => {
  const probe = makeCgroup2Probe({
    fs: {
      readFile: async path => {
        if (path === '/proc/self/cgroup') {
          // cgroup v1 line shape — no `0::` entry.
          return '12:cpuset:/\n11:memory:/\n';
        }
        throw new Error(`unexpected read ${path}`);
      },
    },
  });
  const result = await probe.probe();
  t.false(result.available);
  t.deepEqual(result.controllers, []);
  t.regex(result.reason ?? '', /no cgroup v2 entry/);
});

test('makeCgroup2Probe reports missing controllers when delegation is partial', async t => {
  const probe = makeCgroup2Probe({
    fs: {
      readFile: async path => {
        if (path === '/proc/self/cgroup') return '0::/user.slice/session\n';
        if (path.endsWith('/cgroup.controllers')) {
          // Only `pids` delegated — missing `memory` and `cpu`.
          return 'pids\n';
        }
        throw new Error(`unexpected read ${path}`);
      },
    },
  });
  const result = await probe.probe();
  t.false(result.available);
  t.deepEqual(result.controllers, ['pids']);
  t.regex(result.reason ?? '', /missing controllers.*memory.*cpu/);
});

test('makeCgroup2Probe reports available when all controllers are delegated', async t => {
  const probe = makeCgroup2Probe({
    fs: {
      readFile: async path => {
        if (path === '/proc/self/cgroup') return '0::/user.slice/session\n';
        if (path.endsWith('/cgroup.controllers')) {
          return 'cpu io memory pids\n';
        }
        throw new Error(`unexpected read ${path}`);
      },
    },
  });
  const result = await probe.probe();
  t.true(result.available);
  t.deepEqual(result.controllers, ['cpu', 'io', 'memory', 'pids']);
});
