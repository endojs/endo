// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import { makeLandlockProbe } from '../src/landlock.js';

/**
 * Phase 1.5 unit tests for the Landlock kernel-feature probe.
 * Uses a stub `fs` so the test runs identically on any host —
 * the probe's job is to inspect `/sys/kernel/security/lsm` and
 * report what it sees, not to call the syscall itself.
 */

test('reports unavailable when /sys/kernel/security/lsm is missing', async t => {
  const probe = makeLandlockProbe({
    fs: {
      readFile: async () => {
        const e = /** @type {Error & { code?: string }} */ (
          new Error('ENOENT: no such file')
        );
        e.code = 'ENOENT';
        throw e;
      },
    },
  });
  const result = await probe.probe();
  t.false(result.available);
  t.regex(result.reason ?? '', /no \/sys\/kernel\/security\/lsm/);
});

test('reports unavailable when landlock is not in the LSM list', async t => {
  const probe = makeLandlockProbe({
    fs: {
      readFile: async () => 'capability,yama,bpf\n',
    },
  });
  const result = await probe.probe();
  t.false(result.available);
  t.regex(result.reason ?? '', /landlock not in/);
});

test('reports available when landlock appears in the LSM list', async t => {
  const probe = makeLandlockProbe({
    fs: {
      readFile: async () => 'capability,landlock,lockdown,yama,bpf\n',
    },
  });
  const result = await probe.probe();
  t.true(result.available);
  t.is(result.reason, undefined);
});

test('reports unavailable on other read errors with a structured reason', async t => {
  const probe = makeLandlockProbe({
    fs: {
      readFile: async () => {
        throw new Error('EACCES: permission denied');
      },
    },
  });
  const result = await probe.probe();
  t.false(result.available);
  t.regex(result.reason ?? '', /lsm read failed/);
});
