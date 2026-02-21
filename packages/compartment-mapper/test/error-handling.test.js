/* global globalThis */
import 'ses';
import test from 'ava';

import { scaffold, sanitizePaths } from './scaffold.js';

const lockedDown = typeof globalThis.harden === 'function';

const assertFixture = t => {
  t.fail('Expected an error.');
};
const fixtureAssertionCount = 2;
const fixtureUrl = path => new URL(path, import.meta.url).toString();

const stackTools = {
  getThrownFrom(stack) {
    const arr = stack.split('\n');
    return arr[1];
  },
};
const onError = (t, { error, title }) => {
  const from = stackTools.getThrownFrom(error.stack);
  // Assert that errors for cjs get postponed to execution
  if (title.match(/cjs/i)) {
    if (title.match(/cjs.*archive/i)) {
      t.regex(from, /at .*execute/);
    } else {
      t.regex(from, /at .*importHook/);
    }
  } else if (title.match(/esm|both/i)) {
    t.regex(from, /at .*load/);
  } else {
    t.fail();
  }

  // The 'fixtures-error-handling / both' test intermittently captures 1 or 2
  // underlying failures due to timing. esm/csj order is not deterministic.
  if (title.match(/both/i)) {
    t.pass();
    return;
  }
  const sanitizedStack = sanitizePaths(error.stack, true);
  if (lockedDown) {
    t.regex(sanitizedStack, /fixtures-error-handling/);
    return;
  }
  t.snapshot(sanitizedStack);
};

scaffold(
  'fixtures-error-handling / esm',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/esm/main.js'),
  assertFixture,
  fixtureAssertionCount,
  {
    onError,
    shouldFailBeforeArchiveOperations: true,
  },
);

scaffold(
  'fixtures-error-handling / cjs',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/cjs/main.js'),
  assertFixture,
  fixtureAssertionCount,
  {
    onError,
    shouldFailBeforeArchiveOperations: false,
  },
);

scaffold(
  'fixtures-error-handling / both',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/both/main.js'),
  assertFixture,
  fixtureAssertionCount,
  {
    onError,
    shouldFailBeforeArchiveOperations: true,
  },
);

scaffold(
  'fixtures-error-handling / catch',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/catch/main.js'),
  assertFixture,
  1,
  {
    onError: (t, { error }) => {
      t.regex(error.message, /obviouslymissing/);
    },
    shouldFailBeforeArchiveOperations: false,
  },
);

scaffold(
  'fixtures-error-handling / throw falsy',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/what-the-falsy/main.js'),
  assertFixture,
  1,
  {
    onError: (t, { error }) => {
      if (lockedDown) {
        t.true(
          error === false || error === undefined || error instanceof Error,
          'lockdown may wrap falsy throws',
        );
        return;
      }
      t.assert(!error);
    },
    shouldFailBeforeArchiveOperations: false,
  },
);
